import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 画像URL（署名付き）の有効期間。CSV内の参照用（電子保存の紐付け補助）。
const IMAGE_URL_TTL = 60 * 60 * 24 * 30; // 30日

// CSVの値エスケープ（カンマ・引用符・改行を含む場合はダブルクオート囲み）
function esc(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// freee会計「取引の一括登録」向けの明細CSV（1件=1行）。
//   GET /api/accounting/receipts-export?year=2026&status=all|confirmed
// - 発生日（領収日）が対象年の領収書を出力。日付・金額が読み取れていない行は対象外
//   （freee側で発生日・金額が必須のため。先に領収書画面で入力してから出力する）。
// - 文字コードは UTF-8 with BOM・改行CRLF（Excel/freeeの文字化け対策）。
// - 税区分はシステムに項目が無いため一律「課対仕入10%」で出力し、軽減税率(8%)や
//   対象外の行は freee 取込後に修正する運用（docs/ACCOUNTING.md 参照）。
export async function GET(req: NextRequest) {
  await requireAdmin(); // オーナーのみ

  const url = new URL(req.url);
  const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const yearParam = url.searchParams.get("year") ?? "";
  const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : jstNow.getUTCFullYear();
  const confirmedOnly = url.searchParams.get("status") === "confirmed";

  const supabase = await createClient();
  let q = supabase
    .from("receipts")
    .select("id, image_url, detected_date, detected_amount, detected_merchant, suggested_account, status")
    .gte("detected_date", `${year}-01-01`)
    .lte("detected_date", `${year}-12-31`)
    .order("detected_date", { ascending: true });
  if (confirmedOnly) q = q.eq("status", "confirmed");
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  type Row = {
    id: string;
    image_url: string;
    detected_date: string | null;
    detected_amount: number | null;
    detected_merchant: string | null;
    suggested_account: string | null;
    status: string;
  };
  const rows = ((data ?? []) as Row[]).filter((r) => r.detected_date && r.detected_amount != null);
  if (rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: `${year}年の出力対象（日付・金額あり）の領収書がありません。` },
      { status: 404 }
    );
  }

  // 画像の署名付きURL（非公開バケットのためまとめて発行。失敗しても空欄で続行）
  const admin = createAdminClient();
  const paths = [...new Set(rows.map((r) => r.image_url))];
  const signed = new Map<string, string>();
  const { data: signedList } = await admin.storage.from("receipts").createSignedUrls(paths, IMAGE_URL_TTL);
  for (const s of signedList ?? []) {
    if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }

  const header = [
    "発生日",
    "収支区分",
    "金額",
    "取引先",
    "勘定科目",
    "税区分",
    "支払手段",
    "支払者",
    "備考",
    "領収書ID",
    "画像URL",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.detected_date!,
        "支出",
        String(Math.round(Number(r.detected_amount))),
        esc(r.detected_merchant?.trim() || "不明"),
        esc(r.suggested_account?.trim() || "未分類"),
        "課対仕入10%",
        "", // 支払手段（システムに項目なし）
        "", // 支払者（システムに項目なし）
        "", // 備考（システムに項目なし）
        r.id,
        esc(signed.get(r.image_url) ?? ""),
      ].join(",")
    );
  }
  const csv = "\uFEFF" + lines.join("\r\n") + "\r\n"; // UTF-8 BOM + CRLF

  const filename = `freee_expenses_${year}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
