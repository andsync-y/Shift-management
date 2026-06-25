import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CardTransaction, Receipt } from "@/lib/types";
import CardManager, { type CardRow } from "./CardManager";

export default async function CardsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: txRaw } = await supabase
    .from("card_transactions")
    .select("*")
    .order("transaction_date", { ascending: false })
    .limit(500);
  const tx = (txRaw ?? []) as CardTransaction[];

  // 紐付いた領収書（金額・日付の確認用）
  const rids = tx.map((t) => t.receipt_id).filter((x): x is string => !!x);
  const { data: recRaw } = rids.length
    ? await supabase.from("receipts").select("id, detected_date, detected_amount, detected_merchant").in("id", rids)
    : { data: [] };
  const recById = new Map(
    ((recRaw ?? []) as Pick<Receipt, "id" | "detected_date" | "detected_amount" | "detected_merchant">[]).map((r) => [
      r.id,
      r,
    ])
  );

  const rows: CardRow[] = tx.map((t) => ({
    id: t.id,
    transaction_date: t.transaction_date,
    amount: Number(t.amount),
    merchant_name: t.merchant_name,
    matched: t.receipt_id
      ? {
          merchant: recById.get(t.receipt_id)?.detected_merchant ?? null,
          amount: recById.get(t.receipt_id)?.detected_amount ?? null,
        }
      : null,
  }));

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">経理</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>
            Card Transactions
          </h1>
          <p className="sub">カード明細のCSV取込（{rows.length}件）</p>
        </div>
      </div>
      <CardManager rows={rows} />
    </div>
  );
}
