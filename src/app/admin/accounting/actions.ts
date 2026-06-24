"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export type AcctResult = { ok: boolean; message: string };

// 領収書の内容を修正（AI検出値の手直し・勘定科目の設定）
export async function updateReceipt(
  id: string,
  patch: {
    detected_date: string | null;
    detected_amount: number | null;
    detected_merchant: string | null;
    suggested_account: string | null;
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

export async function deleteMonthlySale(id: string): Promise<AcctResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("monthly_sales").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/accounting/sales");
  revalidatePath("/admin/accounting");
  return { ok: true, message: "削除しました。" };
}
