import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { extractReceipts } from "@/lib/accounting/receipt-ocr";

export const dynamic = "force-dynamic";

type Media = "image/png" | "image/jpeg" | "image/gif" | "image/webp";
const MEDIA: Media[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

// 領収書まとめ撮り画像（Supabase Storage）→ Claudeで複数領収書を抽出。
// body: { path, bucket="receipts", insert? }
// insert=true で receipts に status='pending' 登録（→自動マッチング発火）。
export async function POST(req: NextRequest) {
  await requireAdmin(); // オーナーのみ

  let body: { path?: string; bucket?: string; insert?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "不正なJSON" }, { status: 400 });
  }
  const path = body.path;
  const bucket = body.bucket ?? "receipts";
  if (!path) return NextResponse.json({ ok: false, error: "path が必要です" }, { status: 400 });

  // Storage からダウンロード（service role）
  const admin = createAdminClient();
  const { data: file, error: dlErr } = await admin.storage.from(bucket).download(path);
  if (dlErr || !file) {
    return NextResponse.json(
      { ok: false, error: `画像取得失敗: ${dlErr?.message ?? "not found"}` },
      { status: 404 }
    );
  }
  const media = (MEDIA.includes(file.type as Media) ? file.type : "image/jpeg") as Media;
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const res = await extractReceipts(base64, media);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.message }, { status: 502 });

  let inserted = 0;
  if (body.insert && res.receipts.length > 0) {
    // オーナーセッションで insert → 監査ログの changed_by に記録される
    const supabase = await createClient();
    const rows = res.receipts.map((r) => ({
      image_url: path,
      detected_date: r.date,
      detected_amount: r.amount,
      detected_merchant: r.merchant,
      status: "pending",
    }));
    const { error, count } = await supabase.from("receipts").insert(rows, { count: "exact" });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message, receipts: res.receipts }, { status: 500 });
    }
    inserted = count ?? rows.length;
  }

  return NextResponse.json({ ok: true, receipts: res.receipts, inserted });
}
