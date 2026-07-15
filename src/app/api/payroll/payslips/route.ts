import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { pushLineMessage } from "@/lib/line";
import { collectPayslips } from "@/lib/payslip/data";
import { buildPayslipPdf, buildPayslipsPdf } from "@/lib/payslip/pdf";

export const dynamic = "force-dynamic";

const SIGNED_URL_TTL = 60 * 60 * 24 * 60; // 60日（LINEで送るリンクの有効期間）

// 同梱フォント（public/fonts）を自分自身のオリジンから取得する
// （serverless バンドルにファイルを含めなくて済む・CDNキャッシュも効く）。
async function loadFont(req: NextRequest): Promise<Uint8Array> {
  const url = new URL("/fonts/NotoSansJP-Medium-sub.ttf", req.url);
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`フォント取得失敗: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function monthParam(req: NextRequest): string | null {
  const m = new URL(req.url).searchParams.get("month") ?? "";
  return /^\d{4}-\d{2}$/.test(m) ? m : null;
}

// 給与明細PDFのダウンロード（オーナーのみ）。
//   GET /api/payroll/payslips?month=YYYY-MM            → 全員分を1つのPDF（1人1ページ）
//   GET /api/payroll/payslips?month=YYYY-MM&staff=<id> → 1人分のPDF
export async function GET(req: NextRequest) {
  await requireAdmin();
  const month = monthParam(req);
  if (!month) return NextResponse.json({ ok: false, error: "month が不正です。" }, { status: 400 });
  const staffId = new URL(req.url).searchParams.get("staff");

  const supabase = await createClient();
  const entries = await collectPayslips(supabase, month);
  const targets = staffId ? entries.filter((e) => e.staffId === staffId) : entries;
  if (targets.length === 0) {
    return NextResponse.json({ ok: false, error: "対象の給与データがありません。" }, { status: 404 });
  }

  const font = await loadFont(req);
  const bytes =
    targets.length === 1
      ? await buildPayslipPdf(targets[0].data, font)
      : await buildPayslipsPdf(targets.map((t) => t.data), font);
  const name = targets.length === 1 ? `meisai_${month}_${targets[0].name}.pdf` : `meisai_${month}_all.pdf`;

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}

// 給与明細PDFを全員分生成して、各スタッフのLINEへ署名付きリンクを送信（オーナーのみ）。
//   POST /api/payroll/payslips  body: { month: "YYYY-MM" }
// PDFは非公開バケット payslips に保存（payslips/YYYY-MM/<staffId>.pdf・上書き）。
export async function POST(req: NextRequest) {
  await requireAdmin();
  const body = (await req.json().catch(() => null)) as { month?: string } | null;
  const month = /^\d{4}-\d{2}$/.test(body?.month ?? "") ? body!.month! : null;
  if (!month) return NextResponse.json({ ok: false, error: "month が不正です。" }, { status: 400 });

  const supabase = await createClient();
  const entries = await collectPayslips(supabase, month);
  if (entries.length === 0) {
    return NextResponse.json({ ok: false, error: "対象の給与データがありません。" }, { status: 404 });
  }

  const font = await loadFont(req);
  const admin = createAdminClient();
  const [y, m] = month.split("-").map(Number);
  let sent = 0;
  const noLine: string[] = [];
  const failed: string[] = [];

  for (const e of entries) {
    const pdf = await buildPayslipPdf(e.data, font);
    const path = `${month}/${e.staffId}.pdf`;
    const up = await admin.storage
      .from("payslips")
      .upload(path, Buffer.from(pdf), { contentType: "application/pdf", upsert: true });
    if (up.error) {
      failed.push(`${e.name}(保存: ${up.error.message})`);
      continue;
    }
    if (!e.lineUserId) {
      noLine.push(e.name);
      continue;
    }
    const { data: signed, error: sErr } = await admin.storage.from("payslips").createSignedUrl(path, SIGNED_URL_TTL);
    if (sErr || !signed?.signedUrl) {
      failed.push(`${e.name}(URL発行失敗)`);
      continue;
    }
    const ok = await pushLineMessage(
      e.lineUserId,
      `${y}年${m}月分の給与明細です（${e.data.payDateLabel}支給）。\nこちらから確認できます（60日間有効）:\n${signed.signedUrl}`
    );
    if (ok) sent++;
    else failed.push(`${e.name}(LINE送信失敗)`);
  }

  const parts = [`${sent}名へ送信しました`];
  if (noLine.length) parts.push(`LINE未連携: ${noLine.join("・")}`);
  if (failed.length) parts.push(`失敗: ${failed.join("・")}`);
  return NextResponse.json({ ok: failed.length === 0, sent, noLine, failed, message: parts.join("／") });
}
