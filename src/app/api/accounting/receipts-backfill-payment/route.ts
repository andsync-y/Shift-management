import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { extractReceipts } from "@/lib/accounting/receipt-ocr";

export const dynamic = "force-dynamic";

// 1回のPOSTで再OCRする画像数。画面側がループで呼び、進捗%を表示する
// （1リクエストを短く保ちサーバーのタイムアウトを避ける）。
const IMAGES_PER_CALL = 2;

type Media = "image/png" | "image/jpeg" | "image/gif" | "image/webp";
const EXT_TO_MEDIA: Record<string, Media> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

type Row = { id: string; image_url: string; detected_date: string | null; detected_amount: number | null };

async function pendingRows(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Row[]> {
  const { data } = await supabase
    .from("receipts")
    .select("id, image_url, detected_date, detected_amount")
    .is("payment_method", null);
  return (data ?? []) as Row[];
}

// 進捗の現在地（残り画像数・行数）。画面側が%計算の分母を取るのに使う。
export async function GET() {
  await requireAdmin();
  const supabase = await createClient();
  const rows = await pendingRows(supabase);
  return NextResponse.json({
    ok: true,
    remainingImages: new Set(rows.map((r) => r.image_url)).size,
    remainingRows: rows.length,
  });
}

// 支払手段が未設定の既存領収書を少しずつ埋める（オーナーのみ・画面からループ実行）。
//   POST body: { skip?: string[] } … 既に処理した画像パス（判定不能の行が残る画像を
//   再選択して無限ループしないよう、画面側が累積して渡す）
// 毎回: 1) カード明細照合済み→'card'（冪等・軽量） 2) skip以外の画像を IMAGES_PER_CALL 枚だけ再OCR。
export async function POST(req: NextRequest) {
  await requireAdmin();
  const body = (await req.json().catch(() => null)) as { skip?: string[] } | null;
  const skip = new Set(Array.isArray(body?.skip) ? body!.skip!.filter((s) => typeof s === "string") : []);

  const supabase = await createClient();
  const admin = createAdminClient();

  // 1) カード明細と照合済み → 'card'（毎回実行しても冪等）
  let byMatch = 0;
  {
    const rows = await pendingRows(supabase);
    if (rows.length > 0) {
      const { data: cards } = await supabase
        .from("card_transactions")
        .select("receipt_id")
        .in("receipt_id", rows.map((t) => t.id));
      const matchedIds = [
        ...new Set(((cards ?? []) as { receipt_id: string | null }[]).map((c) => c.receipt_id).filter(Boolean)),
      ] as string[];
      if (matchedIds.length > 0) {
        const { error: upErr } = await supabase.from("receipts").update({ payment_method: "card" }).in("id", matchedIds);
        if (!upErr) byMatch = matchedIds.length;
      }
    }
  }

  // 2) skip以外の画像から数枚だけ再OCR
  const still = await pendingRows(supabase);
  const byImage = new Map<string, Row[]>();
  for (const r of still) {
    if (!byImage.has(r.image_url)) byImage.set(r.image_url, []);
    byImage.get(r.image_url)!.push(r);
  }
  const candidates = [...byImage.keys()].filter((p) => !skip.has(p));
  const targets = candidates.slice(0, IMAGES_PER_CALL);

  let ocrCard = 0;
  let ocrCash = 0;
  let failed = 0;
  let undecided = 0;
  for (const path of targets) {
    const rows = byImage.get(path)!;
    const { data: file, error: dlErr } = await admin.storage.from("receipts").download(path);
    if (dlErr || !file) {
      failed++;
      undecided += rows.length;
      continue;
    }
    const ext = path.split(".").pop()?.toLowerCase() ?? "jpg";
    const media = EXT_TO_MEDIA[ext] ?? "image/jpeg";
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const res = await extractReceipts(base64, media);
    if (!res.ok) {
      failed++;
      undecided += rows.length;
      continue;
    }
    for (const row of rows) {
      const hits = res.receipts.filter(
        (d) =>
          d.payment &&
          d.date === row.detected_date &&
          d.amount != null &&
          Math.round(d.amount) === Math.round(Number(row.detected_amount ?? NaN))
      );
      if (hits.length !== 1) {
        undecided++;
        continue;
      }
      const pm = hits[0].payment!;
      const { error: upErr } = await supabase.from("receipts").update({ payment_method: pm }).eq("id", row.id);
      if (!upErr) {
        if (pm === "card") ocrCard++;
        else ocrCash++;
      } else {
        undecided++;
      }
    }
  }

  const remainingImages = candidates.length - targets.length; // 未処理（skip・今回分を除く）
  const { count: remainingRows } = await supabase
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .is("payment_method", null);

  return NextResponse.json({
    ok: true,
    done: remainingImages === 0,
    processedImages: targets, // 画面側が skip に積む
    byMatch,
    ocrCard,
    ocrCash,
    failed,
    undecided,
    remainingImages,
    remainingRows: remainingRows ?? 0,
  });
}
