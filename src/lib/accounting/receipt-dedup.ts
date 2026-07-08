// =====================================================================
// 領収書の重複取込防止
// =====================================================================
// 過去に取り込んだ領収書（receipts）と照合し、同じ領収書の再取込をスキップする。
// 判定: 日付＋金額が一致し、支払先が矛盾しない（どちらかが不明 or 正規化一致）なら重複。
// 日付＋金額が同じでも支払先が明確に別なら取り込む（同日同額の別店舗を誤スキップしない）。
// 日付か金額が読めなかったものは判定不能として取り込む（人の確認に回す）。
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DetectedReceipt } from "./receipt-ocr";

interface ReceiptKey {
  detected_date: string | null;
  detected_amount: number | null;
  detected_merchant: string | null;
}

// 支払先名の正規化: 全半角・大小文字・空白・記号ゆれを吸収して比較する。
export function normMerchant(s: string | null): string | null {
  if (!s) return null;
  const t = s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]/g, "")
    .replace(/[()（）「」『』・.．,、-]/g, "");
  return t || null;
}

function isDup(r: DetectedReceipt, pool: ReceiptKey[]): boolean {
  if (!r.date || r.amount == null) return false;
  const m = normMerchant(r.merchant);
  return pool.some((e) => {
    if (e.detected_date !== r.date || e.detected_amount == null || Number(e.detected_amount) !== r.amount) return false;
    const em = normMerchant(e.detected_merchant);
    return m == null || em == null || m === em;
  });
}

// OCR結果を「新規(fresh)」と「重複スキップ(skipped)」に振り分ける。
// DB照合は検出した日付の既存行だけをまとめて1クエリで取得。
// 同バッチ内の二重検出（同じレシートが2回検出された等）も除外する。
export async function splitDuplicateReceipts(
  supabase: SupabaseClient,
  receipts: DetectedReceipt[]
): Promise<{ fresh: DetectedReceipt[]; skipped: DetectedReceipt[] }> {
  const dated = receipts.filter((r) => r.date && r.amount != null);
  let existing: ReceiptKey[] = [];
  if (dated.length > 0) {
    const dates = [...new Set(dated.map((r) => r.date!))];
    const { data } = await supabase
      .from("receipts")
      .select("detected_date, detected_amount, detected_merchant")
      .in("detected_date", dates);
    existing = (data as ReceiptKey[] | null) ?? [];
  }

  const fresh: DetectedReceipt[] = [];
  const skipped: DetectedReceipt[] = [];
  for (const r of receipts) {
    const batchPool: ReceiptKey[] = fresh.map((f) => ({
      detected_date: f.date,
      detected_amount: f.amount,
      detected_merchant: f.merchant,
    }));
    if (isDup(r, existing) || isDup(r, batchPool)) skipped.push(r);
    else fresh.push(r);
  }
  return { fresh, skipped };
}
