import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { extractReceipts } from "@/lib/accounting/receipt-ocr";

export const dynamic = "force-dynamic";

// 1回の実行で再OCRする画像数の上限（タイムアウト対策。残りは再実行で続きから）
const MAX_IMAGES_PER_RUN = 25;

type Media = "image/png" | "image/jpeg" | "image/gif" | "image/webp";
const EXT_TO_MEDIA: Record<string, Media> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

// 支払手段が未設定の既存領収書に payment_method を一括で埋める（オーナーのみ）。
//   POST /api/accounting/receipts-backfill-payment
// 1) カード明細と照合済みの行 → OCRせず 'card' に更新
// 2) 残りは画像ごとに再OCRし、日付＋金額で既存行と突合して card/cash を更新
//    （新規行は作らない・判定できなかった行は null のまま＝画面で手修正）
export async function POST() {
  await requireAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: targetsRaw, error } = await supabase
    .from("receipts")
    .select("id, image_url, detected_date, detected_amount")
    .is("payment_method", null);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  type Row = { id: string; image_url: string; detected_date: string | null; detected_amount: number | null };
  const targets = (targetsRaw ?? []) as Row[];
  if (targets.length === 0) {
    return NextResponse.json({ ok: true, message: "支払手段が未設定の領収書はありません。" });
  }

  // 1) カード明細と照合済み → 'card'
  let byMatch = 0;
  {
    const { data: cards } = await supabase
      .from("card_transactions")
      .select("receipt_id")
      .in("receipt_id", targets.map((t) => t.id));
    const matchedIds = [...new Set(((cards ?? []) as { receipt_id: string | null }[]).map((c) => c.receipt_id).filter(Boolean))] as string[];
    if (matchedIds.length > 0) {
      const { error: upErr } = await supabase.from("receipts").update({ payment_method: "card" }).in("id", matchedIds);
      if (!upErr) byMatch = matchedIds.length;
    }
  }

  // 2) 残り（照合で埋まらなかった未設定分）を画像ごとに再OCR
  const { data: stillRaw } = await supabase
    .from("receipts")
    .select("id, image_url, detected_date, detected_amount")
    .is("payment_method", null);
  const still = ((stillRaw ?? []) as Row[]);

  const byImage = new Map<string, Row[]>();
  for (const r of still) {
    if (!byImage.has(r.image_url)) byImage.set(r.image_url, []);
    byImage.get(r.image_url)!.push(r);
  }
  const images = [...byImage.keys()];
  const processImages = images.slice(0, MAX_IMAGES_PER_RUN);

  let byOcrCard = 0;
  let byOcrCash = 0;
  let ocrFailed = 0;
  for (const path of processImages) {
    const rows = byImage.get(path)!;
    const { data: file, error: dlErr } = await admin.storage.from("receipts").download(path);
    if (dlErr || !file) {
      ocrFailed++;
      continue;
    }
    const ext = path.split(".").pop()?.toLowerCase() ?? "jpg";
    const media = EXT_TO_MEDIA[ext] ?? "image/jpeg";
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const res = await extractReceipts(base64, media);
    if (!res.ok) {
      ocrFailed++;
      continue;
    }
    // 日付＋金額で既存行と突合（同一キーが複数ある場合は曖昧なのでスキップ）
    for (const row of rows) {
      const candidates = res.receipts.filter(
        (d) => d.payment && d.date === row.detected_date && d.amount != null && Math.round(d.amount) === Math.round(Number(row.detected_amount ?? NaN))
      );
      if (candidates.length !== 1) continue;
      const pm = candidates[0].payment!;
      const { error: upErr } = await supabase.from("receipts").update({ payment_method: pm }).eq("id", row.id);
      if (!upErr) {
        if (pm === "card") byOcrCard++;
        else byOcrCash++;
      }
    }
  }

  const leftImages = images.length - processImages.length;
  const { count: leftCount } = await supabase
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .is("payment_method", null);

  const parts: string[] = [];
  if (byMatch) parts.push(`カード明細照合済み→カード: ${byMatch}件`);
  if (byOcrCard) parts.push(`再OCR判定→カード: ${byOcrCard}件`);
  if (byOcrCash) parts.push(`再OCR判定→現金: ${byOcrCash}件`);
  if (ocrFailed) parts.push(`画像取得/OCR失敗: ${ocrFailed}枚`);
  if (leftImages > 0) parts.push(`未処理画像あと${leftImages}枚（もう一度実行で続き）`);
  const undetermined = leftCount ?? 0;
  parts.push(`残り未設定: ${undetermined}件${undetermined > 0 && leftImages === 0 ? "（印字から判別不能＝一覧で手修正）" : ""}`);

  return NextResponse.json({ ok: true, message: parts.join("／") });
}
