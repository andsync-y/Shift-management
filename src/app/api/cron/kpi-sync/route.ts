import { NextResponse, type NextRequest } from "next/server";
import { dispatchKpiSync } from "@/lib/fc-kpi/dispatch";

export const dynamic = "force-dynamic";

// 本部KPIスクレイパ（GitHub Actions / Playwright）を確実に日次起動するための Cron。
// GitHub の schedule は遅延・スキップが多く不安定なので、Vercel Cron（時間に正確）から
// GitHub の workflow_dispatch を叩いて起動する。スクレイパ本体は GitHub Actions 側で動く。
// 起動処理そのものは給与画面の「今すぐ取得」と共通（src/lib/fc-kpi/dispatch.ts）。
//
// Vercel Cron（vercel.json）から定期実行。手動実行は ?key=<CRON_SECRET>。
// 環境変数は dispatch.ts のコメントを参照（加えて CRON_SECRET が必要）。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET が未設定です" }, { status: 500 });
  const auth = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const r = await dispatchKpiSync();
  if (r.ok) return NextResponse.json({ ok: true, message: r.message });
  return NextResponse.json({ ok: false, error: r.message }, { status: r.status === 204 ? 500 : 502 });
}
