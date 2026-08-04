import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { extractReceipts } from "@/lib/accounting/receipt-ocr";
import { splitDuplicateReceipts } from "@/lib/accounting/receipt-dedup";

export const dynamic = "force-dynamic";

const EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
type Media = keyof typeof EXT;

// 領収書画像をアップロード → Storage保存 → Claudeで複数領収書を抽出（勘定科目のAI提案つき）→
// 重複（過去に取込済みの同じ領収書）を除いて receipts に登録（判定は receipt-dedup.ts）。
// multipart/form-data: file（画像）。返却: { ok, path, receipts, inserted, skipped, skippedItems }
export async function POST(req: NextRequest) {
  await requireAdmin();

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "画像ファイルがありません。" }, { status: 400 });
  }
  const media = (file.type in EXT ? file.type : "image/jpeg") as Media;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) return NextResponse.json({ ok: false, error: "空のファイルです。" }, { status: 400 });
  // 画面側で縮小してから送る想定（downscaleImage）。それでも大きい場合は明確に伝える。
  // ※ 4.5MB超はこのコードに届く前にホスティング側(413)で弾かれることがある。
  if (bytes.length > 4 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "画像が大きすぎます（4MB以下にしてください）。画面からのアップロードは自動で縮小されます。" },
      { status: 413 }
    );
  }

  // Storage へ保存（service role）。日付フォルダ＋ランダムで衝突回避。
  const admin = createAdminClient();
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `uploads/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${rand}.${EXT[media]}`;
  const up = await admin.storage.from("receipts").upload(path, bytes, { contentType: media, upsert: false });
  if (up.error) {
    return NextResponse.json(
      { ok: false, error: `アップロード失敗: ${up.error.message}（receipts バケットが必要）` },
      { status: 500 }
    );
  }

  // OCR
  const res = await extractReceipts(bytes.toString("base64"), media);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.message, path }, { status: 502 });

  const supabase = await createClient();
  const { fresh, skipped: skippedItems } = await splitDuplicateReceipts(supabase, res.receipts);

  // receipts へ登録（オーナーセッション＝監査ログに記録）。
  // 検出0件のときは画像1件だけ残す。全件が重複スキップなら行は作らない。
  const rows =
    fresh.length > 0
      ? fresh.map((r) => ({
          image_url: path,
          detected_date: r.date,
          detected_amount: r.amount,
          detected_merchant: r.merchant,
          suggested_account: r.account,
          payment_method: r.payment,
          status: "pending" as const,
        }))
      : res.receipts.length === 0
        ? [{ image_url: path, status: "pending" as const }]
        : [];
  let inserted = 0;
  if (rows.length > 0) {
    const { error, count } = await supabase.from("receipts").insert(rows, { count: "exact" });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message, path, receipts: res.receipts }, { status: 500 });
    }
    inserted = count ?? rows.length;
  }

  return NextResponse.json({
    ok: true,
    path,
    receipts: res.receipts,
    inserted,
    skipped: skippedItems.length,
    skippedItems,
  });
}
