// 本部KPIスクレイパ（GitHub Actions / Playwright）を起動する。
// アプリ本体（Vercel）では Chromium が動かないため、取得は Actions 側で走らせ、
// 結果は /api/kpi/ingest 経由で fc_kpi に入る。ここはその「起動」だけを担う。
//
// 必要な環境変数:
//   GITHUB_DISPATCH_TOKEN … GitHub PAT（fine-grained: 対象リポジトリの "Actions: write"／
//                            classic は "workflow" スコープ）
//   GITHUB_DISPATCH_REPO     （任意, 既定 "andsync-y/shift-management"）
//   GITHUB_DISPATCH_WORKFLOW （任意, 既定 "fc-kpi-sync.yml"）
//   GITHUB_DISPATCH_REF      （任意, 既定 "main"）

export interface DispatchResult {
  ok: boolean;
  message: string;
  status?: number;
}

export async function dispatchKpiSync(): Promise<DispatchResult> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return {
      ok: false,
      message: "本部からの取得を起動できません（環境変数 GITHUB_DISPATCH_TOKEN が未設定）。",
    };
  }
  const repo = process.env.GITHUB_DISPATCH_REPO ?? "andsync-y/shift-management";
  const workflow = process.env.GITHUB_DISPATCH_WORKFLOW ?? "fc-kpi-sync.yml";
  // ⚠️ 既定は main。以前は作業ブランチ名を既定にしていたため、ブランチを消すと
  //    黙って起動できなくなる状態だった。
  const ref = process.env.GITHUB_DISPATCH_REF ?? "main";

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "shift-management-kpi-sync",
      },
      body: JSON.stringify({ ref }),
    }
  );

  // workflow_dispatch は成功時 204 No Content
  if (res.status === 204) return { ok: true, message: `取得を開始しました（${workflow} / ${ref}）。`, status: 204 };
  const text = await res.text().catch(() => "");
  return {
    ok: false,
    message: `本部からの取得の起動に失敗しました (${res.status}) ${text.slice(0, 200)}`,
    status: res.status,
  };
}
