import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computePayroll, NOMINATION_BACK_RATE, kaisukenBack, type PayrollRecord } from "@/lib/payroll";
import { computeDeductions } from "@/lib/deductions";
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

  // 委託者情報（SMBCから付与される委託者コード等。環境変数で設定）
  const consignor = {
    consignorCode: process.env.ZENGIN_CONSIGNOR_CODE ?? "",
    consignorName: process.env.ZENGIN_CONSIGNOR_NAME ?? "",
    bankCode: process.env.ZENGIN_BANK_CODE ?? "0009", // 三井住友銀行
    bankName: process.env.ZENGIN_BANK_NAME ?? "ﾐﾂｲｽﾐﾄﾓｷﾞﾝｺｳ",
    branchCode: process.env.ZENGIN_BRANCH_CODE ?? "",
    branchName: process.env.ZENGIN_BRANCH_NAME ?? "",
  };
  if (!consignor.consignorCode || !consignor.consignorName || !consignor.branchCode) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "委託者情報が未設定です。環境変数 ZENGIN_CONSIGNOR_CODE / ZENGIN_CONSIGNOR_NAME / ZENGIN_BRANCH_CODE（必要なら ZENGIN_BANK_CODE / ZENGIN_BANK_NAME / ZENGIN_BRANCH_NAME）を設定してください。",
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

  const byStaff = new Map<string, PayrollRecord[]>();
  for (const r of records) (byStaff.get(r.staff_id) ?? byStaff.set(r.staff_id, []).get(r.staff_id)!).push(r);

  const transfers: ZenginTransfer[] = [];
  for (const s of staff) {
    if (!s.bank_code || !s.branch_code || !s.account_number || !s.recipient_kana) continue; // 口座未登録は除外
    const pay = computePayroll(byStaff.get(s.id) ?? [], s.hourly_wage, s.commute_allowance ?? 0, s.commute_distance_km ?? 0);
    const back = NOMINATION_BACK_RATE * (nom.get(s.id) ?? 0);
    const kaisBack = kaisukenBack(kais.get(s.id) ?? 0);
    const grossTotal = pay.gross + back + kaisBack;
    // 振込額は控除後の差引支給（手取り）。源泉は令和8年分税額表で自動計算（手入力があれば優先）。
    const ded = computeDeductions({
      gross: grossTotal,
      commute: pay.commute,
      taxColumn: s.tax_column ?? "otsu",
      dependents: s.dependents_count ?? 0,
      empInsuranceEnrolled: s.emp_insurance_enrolled ?? true,
      shahoEnrolled: s.shaho_enrolled ?? false,
      kaigoApplicable: s.kaigo_applicable ?? false,
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

  const { bytes } = buildZenginData(consignor, transfers, date);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="furikomi_${month}.txt"`,
      "Cache-Control": "no-store",
    },
  });
}
