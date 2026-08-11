import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeStaffPayroll, groupRecordsByStaff } from "@/lib/compute-staff-payroll";
import { buildZenginData, type ZenginTransfer } from "@/lib/zengin";
import type { Profile, TimeRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// 当月の給与（差引支給＝手取り）から全銀フォーマット（総合振込）ファイルを生成してダウンロードさせる。
//   GET /api/payroll/transfer?month=YYYY-MM&date=YYYY-MM-DD（振込指定日）
export async function GET(req: NextRequest) {
  await requireAdmin();
  const url = new URL(req.url);
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") ?? "")
    ? url.searchParams.get("month")!
    : null;
  if (!month) return NextResponse.json({ ok: false, error: "month が不正です。" }, { status: 400 });
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${pad(m)}-01`;
  const end = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date") ?? "")
    ? url.searchParams.get("date")!
    : end;
  // kind=salary で給与振込形式（種別コード11・Web21の「給与／賞与振込」メニュー用）。
  // 既定は総合振込（21）。給与振込は銀行側の締めが早い（通常3営業日前）ことに注意。
  const typeCode = url.searchParams.get("kind") === "salary" ? ("11" as const) : ("21" as const);

  // 委託者情報（取引銀行から付与される委託者コード等。すべて環境変数で設定）。
  // ⚠️ 銀行名・銀行コードに既定値を持たせないこと。
  //    以前は三井住友の 0009 / ﾐﾂｲｽﾐﾄﾓｷﾞﾝｺｳ を既定値にしていたため、取引銀行を
  //    変更したときに古い銀行名が黙ってファイルに混入した。未設定なら空欄にして、
  //    銀行側がコードから補完するのに任せる（受取人側の銀行名も同じ扱い）。
  const consignor = {
    consignorCode: process.env.ZENGIN_CONSIGNOR_CODE ?? "",
    consignorName: process.env.ZENGIN_CONSIGNOR_NAME ?? "",
    bankCode: process.env.ZENGIN_BANK_CODE ?? "",
    bankName: process.env.ZENGIN_BANK_NAME ?? "",
    branchCode: process.env.ZENGIN_BRANCH_CODE ?? "",
    branchName: process.env.ZENGIN_BRANCH_NAME ?? "",
    accountType: process.env.ZENGIN_ACCOUNT_TYPE ?? "1", // 依頼人口座 預金種目（1=普通）
    accountNumber: process.env.ZENGIN_ACCOUNT_NUMBER ?? "", // 依頼人口座番号(7桁)
  };
  const missingEnv = (
    [
      ["ZENGIN_CONSIGNOR_CODE", consignor.consignorCode],
      ["ZENGIN_CONSIGNOR_NAME", consignor.consignorName],
      ["ZENGIN_BANK_CODE", consignor.bankCode],
      ["ZENGIN_BRANCH_CODE", consignor.branchCode],
      ["ZENGIN_ACCOUNT_NUMBER", consignor.accountNumber],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missingEnv.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `委託者情報が未設定です。環境変数 ${missingEnv.join(" / ")} を設定してください（任意: ZENGIN_ACCOUNT_TYPE / ZENGIN_BANK_NAME / ZENGIN_BRANCH_NAME）。`,
      },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const [{ data: recordsRaw }, { data: staffRaw }, { data: nomRaw }, { data: kaisRaw }, { data: taxRaw }] = await Promise.all([
    supabase.from("time_records").select("*").gte("work_date", start).lte("work_date", end),
    supabase.from("profiles").select("*").eq("role", "staff").eq("is_active", true).order("full_name"),
    supabase.from("nomination_counts").select("staff_id, count").eq("month", month),
    supabase.from("kaisuken_counts").select("staff_id, count").eq("month", month),
    supabase.from("income_tax_overrides").select("staff_id, amount").eq("month", month),
  ]);
  const staff = (staffRaw as Profile[] | null) ?? [];
  const records = (recordsRaw as TimeRecord[] | null) ?? [];
  const nom = new Map(((nomRaw as { staff_id: string; count: number }[] | null) ?? []).map((r) => [r.staff_id, r.count]));
  const kais = new Map(((kaisRaw as { staff_id: string; count: number }[] | null) ?? []).map((r) => [r.staff_id, r.count]));
  const taxOverrides = new Map(((taxRaw as { staff_id: string; amount: number }[] | null) ?? []).map((r) => [r.staff_id, r.amount]));

  const byStaff = groupRecordsByStaff(records);

  const transfers: ZenginTransfer[] = [];
  for (const s of staff) {
    if (!s.bank_code || !s.branch_code || !s.account_number || !s.recipient_kana) continue; // 口座未登録は除外
    // 振込額は控除後の差引支給（手取り）。計算は computeStaffPayroll に集約しており、
    // 給与画面・給与明細と必ず同じ金額になる。
    const { deduction: ded } = computeStaffPayroll({
      staff: s,
      records: byStaff.get(s.id) ?? [],
      nominationCount: nom.get(s.id) ?? 0,
      kaisukenCount: kais.get(s.id) ?? 0,
      taxOverride: taxOverrides.get(s.id) ?? null,
    });
    const amount = ded.net;
    if (amount <= 0) continue;
    transfers.push({
      bankCode: s.bank_code,
      bankName: "", // 名称はコードから銀行側で補完される（Web21等）
      branchCode: s.branch_code,
      branchName: "",
      accountType: s.account_type ?? "1",
      accountNumber: s.account_number,
      recipientName: s.recipient_kana,
      amount,
    });
  }

  if (transfers.length === 0) {
    return NextResponse.json(
      { ok: false, error: "振込対象がありません（口座情報の登録、または当月の給与をご確認ください）。" },
      { status: 400 }
    );
  }

  const { bytes } = buildZenginData(consignor, transfers, date, typeCode);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="furikomi_${month}.txt"`,
      "Cache-Control": "no-store",
    },
  });
}
