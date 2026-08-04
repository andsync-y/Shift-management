import { requireAdmin } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { CardTransaction, Receipt } from "@/lib/types";
import ReceiptManager from "./ReceiptManager";

export default async function ReceiptsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: receiptsRaw } = await supabase
    .from("receipts")
    .select("*")
    .order("created_at", { ascending: false });
  const receipts = (receiptsRaw ?? []) as Receipt[];

  // 紐付いたカード明細（領収書ID→明細）
  const ids = receipts.map((r) => r.id);
  const { data: cardsRaw } = ids.length
    ? await supabase.from("card_transactions").select("*").in("receipt_id", ids)
    : { data: [] };
  const cardByReceipt: Record<string, CardTransaction> = {};
  for (const c of (cardsRaw ?? []) as CardTransaction[]) {
    if (c.receipt_id) cardByReceipt[c.receipt_id] = c;
  }

  // 画像の署名付きURL（Storageは非公開）
  const paths = [...new Set(receipts.map((r) => r.image_url))];
  const signed: Record<string, string> = {};
  if (paths.length) {
    const admin = createAdminClient();
    const { data } = await admin.storage.from("receipts").createSignedUrls(paths, 3600);
    for (const s of data ?? []) {
      if (s.path && s.signedUrl) signed[s.path] = s.signedUrl;
    }
  }

  const pending = receipts.filter((r) => r.status === "pending").length;

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">経理</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>
            Receipts
          </h1>
          <p className="sub">領収書の取り込み・確認（未確定 {pending} 件）</p>
        </div>
      </div>

      <ReceiptManager receipts={receipts} cardByReceipt={cardByReceipt} signed={signed} />
    </div>
  );
}
