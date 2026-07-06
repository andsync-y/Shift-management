"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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

  const { data: snap } = await supabase
    .from("fc_kpi")
    .select("data")
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  const m = (snap as { data?: { month?: { month?: string; staffNominations?: { name: string; count: number }[] } } } | null)?.data?.month;
  if (!m || m.month !== month || !Array.isArray(m.staffNominations)) {
    return {
      ok: false,
      message: `本部の${month}の指名数データがありません。先に「店舗KPI」の取得（日次ジョブ）を実行してください。`,
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
