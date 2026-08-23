"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tallyVisitCsv, type VisitTallyResult } from "@/lib/fc-hq/visits-csv";

// 月ごとの指名本数を保存（オーナーのみ）。指名バック＝単価×本数 が総支給に加算される。
export async function setNominationCount(
  staffId: string,
  month: string,
  count: number
): Promise<{ ok: boolean; message?: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };
  const n = Math.max(0, Math.round(count) || 0);

  const supabase = await createClient();
  const { error } = await supabase
    .from("nomination_counts")
    .upsert({ staff_id: staffId, month, count: n }, { onConflict: "staff_id,month" });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/payroll");
  return { ok: true };
}

// 月ごとの回数券販売本数を保存（オーナーのみ）。回数券バック＝本数連動の段階単価×本数 が総支給に加算される。
export async function setKaisukenCount(
  staffId: string,
  month: string,
  count: number
): Promise<{ ok: boolean; message?: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };
  const n = Math.max(0, Math.round(count) || 0);

  const supabase = await createClient();
  const { error } = await supabase
    .from("kaisuken_counts")
    .upsert({ staff_id: staffId, month, count: n }, { onConflict: "staff_id,month" });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/payroll");
  return { ok: true };
}

// 月ごとの源泉所得税の手入力（オーナーのみ）。自動計算できない区分の上書き。
// null（空欄）を渡すと削除＝自動計算に戻す。
export async function setIncomeTaxOverride(
  staffId: string,
  month: string,
  amount: number | null
): Promise<{ ok: boolean; message?: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };

  const supabase = await createClient();
  if (amount == null) {
    const { error } = await supabase
      .from("income_tax_overrides")
      .delete()
      .eq("staff_id", staffId)
      .eq("month", month);
    if (error) return { ok: false, message: error.message };
  } else {
    const n = Math.max(0, Math.round(amount) || 0);
    const { error } = await supabase
      .from("income_tax_overrides")
      .upsert({ staff_id: staffId, month, amount: n }, { onConflict: "staff_id,month" });
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/admin/payroll");
  return { ok: true };
}

// 本部KPI（最新スナップショット）の担当別 指名数を、当月の指名本数として一括取込する。
export async function applyFcNominations(
  month: string
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };
  const supabase = await createClient();

  // 対象月のKPIを持つ最新スナップショットを検索（過去月は月末頃のスナップショットが該当）。
  type Snap = { data?: { month?: { month?: string; staffNominations?: { name: string; count: number }[] } } };
  const { data: snap } = await supabase
    .from("fc_kpi")
    .select("data")
    .eq("data->month->>month", month)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  const m = (snap as Snap | null)?.data?.month;
  if (!m || !Array.isArray(m.staffNominations)) {
    // 当月なら「日次取得がまだ」、過去月なら「遡取得は不可＝手入力で十分」を正しく案内する。
    const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
    const currentMonth = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, "0")}`;
    const [y, mo] = month.split("-");
    const label = `${y}年${Number(mo)}月`;
    return {
      ok: false,
      message:
        month === currentMonth
          ? `本部の${label}の指名数データがまだありません。「店舗KPI」の日次取得の実行後にもう一度お試しください。`
          : `${label}のKPIスナップショットが見つかりませんでした。過去月のデータは本部から遡って取得できないため、指名本数は表に直接入力してください（すでに入力済みであればこの取込は不要です）。`,
    };
  }

  const { data: staff } = await supabase.from("profiles").select("id, full_name, display_name").eq("role", "staff");
  const byName = new Map<string, string>();
  for (const s of (staff ?? []) as { id: string; full_name: string; display_name: string | null }[]) {
    if (s.display_name) byName.set(s.display_name.trim(), s.id);
    byName.set(s.full_name.trim(), s.id);
  }

  const rows: { staff_id: string; month: string; count: number }[] = [];
  const unmatched: string[] = [];
  for (const x of m.staffNominations) {
    const id = byName.get((x.name ?? "").trim());
    if (id) rows.push({ staff_id: id, month, count: Math.max(0, Math.round(x.count) || 0) });
    else if (x.name) unmatched.push(x.name);
  }
  if (rows.length) {
    const { error } = await supabase.from("nomination_counts").upsert(rows, { onConflict: "staff_id,month" });
    if (error) return { ok: false, message: `取込に失敗: ${error.message}` };
  }

  revalidatePath("/admin/payroll");
  const warn = unmatched.length ? `（未一致: ${unmatched.join("・")}）` : "";
  return { ok: true, message: `FCの指名数を ${rows.length}名 取り込みました${warn}。` };
}

// 月別の給与調整（立替精算・臨時手当・貸付返済など）を保存する。
// amount>0=支給 / amount<0=控除 / taxable=false は課税対象から除く（非課税）。
// 金額0かつ摘要なしなら行ごと削除する。
export async function setPayrollAdjustment(
  staffId: string,
  month: string,
  amount: number,
  label: string,
  taxable: boolean
): Promise<{ ok: boolean; message?: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };

  const n = Math.round(amount) || 0;
  const l = label.trim().slice(0, 60);
  const supabase = await createClient();

  if (n === 0 && l === "") {
    const { error } = await supabase
      .from("payroll_adjustments")
      .delete()
      .eq("staff_id", staffId)
      .eq("month", month);
    if (error) return { ok: false, message: error.message };
  } else {
    const { error } = await supabase
      .from("payroll_adjustments")
      .upsert(
        { staff_id: staffId, month, amount: n, label: l || null, taxable },
        { onConflict: "staff_id,month" }
      );
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/admin/payroll");
  return { ok: true };
}

// 本部システムの「来店記録」CSVから、当月の回数券販売本数を担当別に取り込む。
// 手入力していた回数券本数を置き換える（CSVに出てくる担当は0本でも0で上書きする）。
// CSVはブラウザ側で読んで文字列で渡す（本部システムへ直接アクセスはしない）。
export async function importKaisukenFromVisitCsv(
  month: string,
  csvText: string
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };
  if (!csvText.trim()) return { ok: false, message: "CSVが空です。" };

  let tally: VisitTallyResult;
  try {
    tally = tallyVisitCsv(csvText, month);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "CSVの解析に失敗しました。" };
  }

  const [y, mo] = month.split("-");
  const label = `${y}年${Number(mo)}月`;
  if (tally.monthRows === 0) {
    const has = tally.monthsInCsv.length ? `（このCSVに入っているのは ${tally.monthsInCsv.join("・")}）` : "";
    return { ok: false, message: `${label}の来店記録がCSVにありません${has}。本部システムで期間を変えて出力してください。` };
  }

  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("profiles")
    .select("id, full_name, display_name")
    .eq("role", "staff");
  const byName = new Map<string, string>();
  for (const s of (staff ?? []) as { id: string; full_name: string; display_name: string | null }[]) {
    if (s.display_name) byName.set(s.display_name.trim(), s.id);
    byName.set(s.full_name.trim(), s.id);
  }

  const rows: { staff_id: string; month: string; count: number }[] = [];
  const unmatched: string[] = [];
  for (const t of tally.tallies) {
    const id = byName.get(t.staff);
    if (id) rows.push({ staff_id: id, month, count: t.kaisuken });
    else unmatched.push(`${t.staff}(${t.kaisuken}本)`);
  }
  if (rows.length) {
    const { error } = await supabase
      .from("kaisuken_counts")
      .upsert(rows, { onConflict: "staff_id,month" });
    if (error) return { ok: false, message: `取込に失敗: ${error.message}` };
  }

  revalidatePath("/admin/payroll");
  const warn = unmatched.length
    ? `／スタッフ名が一致せず取り込めなかった担当: ${unmatched.join("・")}（表示名を本部の表記に合わせてください）`
    : "";
  return {
    ok: true,
    message: `${label}の回数券 計${tally.totalKaisuken}本を ${rows.length}名 に取り込みました（来店${tally.monthRows}件）${warn}。`,
  };
}
