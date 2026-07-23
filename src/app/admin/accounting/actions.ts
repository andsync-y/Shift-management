"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { fetchMonthlySquareSales } from "@/lib/accounting/square";

export type AcctResult = { ok: boolean; message: string };

// 領収書の内容を修正（AI検出値の手直し・勘定科目の設定）
export async function updateReceipt(
  id: string,
  patch: {
    detected_date: string | null;
    detected_amount: number | null;
    detected_merchant: string | null;
    suggested_account: string | null;
    payment_method: "card" | "cash" | "personal" | null;
  }
): Promise<AcctResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("receipts")
    .update({
      detected_date: patch.detected_date || null,
      detected_amount: patch.detected_amount,
      detected_merchant: patch.detected_merchant || null,
      suggested_account: patch.suggested_account || null,
      payment_method: patch.payment_method || null,
    })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/accounting/receipts");
  return { ok: true, message: "保存しました。" };
}

// 確定 / 確定取消
export async function setReceiptStatus(
  id: string,
  status: "pending" | "confirmed"
): Promise<AcctResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("receipts").update({ status }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/accounting/receipts");
  return { ok: true, message: status === "confirmed" ? "確定しました。" : "確定を取り消しました。" };
}

// 削除（画像もStorageから消す）
export async function deleteReceipt(id: string): Promise<AcctResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: rec } = await supabase.from("receipts").select("image_url").eq("id", id).maybeSingle();
  const { error } = await supabase.from("receipts").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  const path = (rec as { image_url: string } | null)?.image_url;
  if (path) {
    // 他の領収書が同じ画像（まとめ撮り）を参照していなければStorageからも削除
    const { count } = await supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("image_url", path);
    if ((count ?? 0) === 0) {
      await createAdminClient().storage.from("receipts").remove([path]);
    }
  }
  revalidatePath("/admin/accounting/receipts");
  return { ok: true, message: "削除しました。" };
}

// 月次売上の登録/更新（月キーで upsert）
export async function upsertMonthlySale(
  month: string,
  amount: number,
  memo: string | null
): Promise<AcctResult> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の指定が不正です（YYYY-MM）。" };
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, message: "金額を正しく入力してください。" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("monthly_sales")
    .upsert({ month, amount, memo: memo || null }, { onConflict: "month" });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/accounting/sales");
  revalidatePath("/admin/accounting");
  return { ok: true, message: `${month} の売上を保存しました。` };
}

// Squareから当該月の税抜純売上を取得し、monthly_sales に上書き保存
export async function syncSquareSales(month: string): Promise<AcctResult> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の指定が不正です（YYYY-MM）。" };
  const res = await fetchMonthlySquareSales(month);
  if (!res.ok) return { ok: false, message: res.message ?? "Square取得に失敗しました。" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("monthly_sales")
    .upsert(
      { month, amount: res.amount, memo: `Square自動取得（税抜純売上・${res.count}件）` },
      { onConflict: "month" }
    );
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/accounting/sales");
  revalidatePath("/admin/accounting");
  return { ok: true, message: `${month} の売上を取得：¥${res.amount.toLocaleString()}（${res.count}件）` };
}

export async function deleteMonthlySale(id: string): Promise<AcctResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("monthly_sales").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/accounting/sales");
  revalidatePath("/admin/accounting");
  return { ok: true, message: "削除しました。" };
}

// カード明細をCSV取込（クライアントで列マッピング・正規化済みの配列を受ける）。
// 既存と日付+金額+店名が完全一致する行はスキップ（重複防止）。挿入で自動マッチングが発火。
export async function insertCardTransactions(
  rows: { transaction_date: string; amount: number; merchant_name: string | null }[]
): Promise<AcctResult> {
  await requireAdmin();
  const valid = rows.filter(
    (r) => /^\d{4}-\d{2}-\d{2}$/.test(r.transaction_date) && Number.isFinite(r.amount)
  );
  if (valid.length === 0) return { ok: false, message: "取り込める明細がありません。" };

  const supabase = await createClient();
  // 取込対象の日付範囲の既存明細を取得して重複キーを作る
  const dates = valid.map((r) => r.transaction_date).sort();
  const { data: existing } = await supabase
    .from("card_transactions")
    .select("transaction_date, amount, merchant_name")
    .gte("transaction_date", dates[0])
    .lte("transaction_date", dates[dates.length - 1]);
  const key = (d: string, a: number, m: string | null) => `${d}|${a}|${m ?? ""}`;
  const seen = new Set(
    ((existing ?? []) as { transaction_date: string; amount: number; merchant_name: string | null }[]).map((e) =>
      key(e.transaction_date, Number(e.amount), e.merchant_name)
    )
  );

  const toInsert: typeof valid = [];
  for (const r of valid) {
    const k = key(r.transaction_date, r.amount, r.merchant_name);
    if (seen.has(k)) continue; // 既存と重複
    seen.add(k); // 取込内の重複も除外
    toInsert.push(r);
  }
  const skipped = valid.length - toInsert.length;
  if (toInsert.length === 0) {
    return { ok: false, message: `全${valid.length}件が既存と重複のためスキップしました。` };
  }
  const { error } = await supabase.from("card_transactions").insert(toInsert);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/accounting/cards");
  revalidatePath("/admin/accounting");
  return {
    ok: true,
    message: `${toInsert.length}件を取り込みました${skipped > 0 ? `（重複${skipped}件をスキップ）` : ""}。`,
  };
}

// カード明細の勘定科目を更新
export async function updateCardAccount(id: string, account: string | null): Promise<AcctResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("card_transactions")
    .update({ account: account && account.trim() ? account.trim() : null })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/accounting/cards");
  revalidatePath("/admin/accounting/report");
  return { ok: true, message: "勘定科目を更新しました。" };
}

export async function deleteCardTransaction(id: string): Promise<AcctResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("card_transactions").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/accounting/cards");
  revalidatePath("/admin/accounting");
  return { ok: true, message: "削除しました。" };
}
