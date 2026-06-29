import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// 本部KPIスクレイパ（GitHub Actions / Playwright）を確実に日次起動するための Cron。
// GitHub の schedule は遅延・スキップが多く不安定なので、Vercel Cron（時間に正確）から
// GitHub の workflow_dispatch を叩いて起動する。スクレイパ本体は GitHub Actions 側で動く。
//
// Vercel Cron（vercel.json）から定期実行。手動実行は ?key=<CRON_SECRET>。
// 必要な環境変数:
//   CRON_SECRET           … 既存（Vercel Cron 認証）
//   GITHUB_DISPATCH_TOKEN … GitHub PAT（fine-grained: 対象リポジトリの "Actions: write"／
//                            classic は "workflow" スコープ）
//   GITHUB_DISPATCH_REPO     （任意, 既定 "andsync-y/shift-management"）
//   GITHUB_DISPATCH_WORKFLOW （任意, 既定 "fc-kpi-sync.yml"）
//   GITHUB_DISPATCH_REF      （任意, 既定 "claude/amazing-dijkstra-6D0dG"）
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET が未設定です" }, { status: 500 });
  const auth = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "GITHUB_DISPATCH_TOKEN が未設定です" }, { status: 500 });
  }
  const repo = process.env.GITHUB_DISPATCH_REPO ?? "andsync-y/shift-management";
  const workflow = process.env.GITHUB_DISPATCH_WORKFLOW ?? "fc-kpi-sync.yml";
  const ref = process.env.GITHUB_DISPATCH_REF ?? "claude/amazing-dijkstra-6D0dG";

  const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "shift-management-kpi-cron",
    },
    body: JSON.stringify({ ref }),
  });

  // workflow_dispatch は成功時 204 No Content
  if (res.status === 204) {
    return NextResponse.json({ ok: true, dispatched: workflow, ref });
  }
  const text = await res.text().catch(() => "");
  return NextResponse.json(
    { ok: false, error: `GitHub dispatch 失敗 (${res.status})`, detail: text.slice(0, 300) },
    { status: 502 },
  );
}
