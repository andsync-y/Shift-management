// 本部システム(zn-stretch)から日次でKPIを取得し、アプリの保護APIへ送る。
// Vercelでは動かないため、GitHub Actions（cron）/ ローカル / VPS など Chromium が動く環境で実行する。
//
// 必要な環境変数（GitHub Secrets 等に設定。リポジトリやアプリには置かない）:
//   FC_LOGIN_URL       本部ログインURL（例: https://system.zn-stretch.com/login）
//   FC_USER            本部ログインID
//   FC_PASS            本部ログインパスワード（※チャットに貼らない・定期的に変更）
//   APP_INGEST_URL     送信先（例: https://shift.andsync.jp/api/kpi/ingest）
//   KPI_INGEST_SECRET  送信先の認証シークレット（アプリの環境変数と一致）
//   DRY_RUN=1          送信せず内容を表示するだけ
//
// ⚠️ 画面のセレクタ（CSS）は実画面に合わせて要調整。下の SELECTORS と extract* を実機で確認して埋める。
import { chromium } from "playwright";

const {
  FC_LOGIN_URL,
  FC_USER,
  FC_PASS,
  APP_INGEST_URL,
  KPI_INGEST_SECRET,
  DRY_RUN,
} = process.env;

// ← 実画面に合わせて調整するセレクタ。まずは一般的な候補を入れてある。
const SELECTORS = {
  user: process.env.FC_USER_SELECTOR || 'input[name="login_id"], input[name="username"], input[type="text"]',
  pass: process.env.FC_PASS_SELECTOR || 'input[name="password"], input[type="password"]',
  submit: process.env.FC_SUBMIT_SELECTOR || 'button[type="submit"], input[type="submit"]',
};

function pad(n) {
  return String(n).padStart(2, "0");
}
function jst(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600 * 1000);
}
function ymd(d) {
  const j = jst(d);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}`;
}

async function login(page) {
  if (!FC_LOGIN_URL) throw new Error("FC_LOGIN_URL 未設定");
  await page.goto(FC_LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.fill(SELECTORS.user, FC_USER);
  await page.fill(SELECTORS.pass, FC_PASS);
  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => {}),
    page.click(SELECTORS.submit),
  ]);
}

// ===== ここから下は本部画面に合わせて実装する（実機でセレクタ確認） =====
// 各関数は本部システムの該当ページへ遷移し、数値を読み取って返す。
// 取得できない項目は null/[] を返してよい（アプリ側は欠損を許容して表示する）。

async function extractMonth(page) {
  // TODO: 当月の「売上 / 新規販売数 / 新規販売率 / 指名数 / 指名率」を読む。
  // 例: await page.goto(".../dashboard"); const sales = await page.textContent("#sales"); ...
  return {
    month: ymd(new Date()).slice(0, 7),
    sales: null,
    newCount: null,
    newRate: null, // 0-1
    nominationCount: null,
    nominationRate: null, // 0-1
  };
}

async function extractYesterday(page) {
  // TODO: 昨日の「新規販売したスタッフ（回数券の回数）」「指名を獲得したスタッフ」を読む。
  const y = new Date();
  y.setUTCDate(y.getUTCDate() - 1);
  return {
    date: ymd(y),
    newSales: [], // [{ staff: "AINA", ticket: 10 }]
    nominations: [], // [{ staff: "AINA", count: 3 }]
  };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await login(page);
    const month = await extractMonth(page);
    const yesterday = await extractYesterday(page);
    const data = { asOf: ymd(new Date()), month, yesterday };

    if (DRY_RUN) {
      console.log("[dry-run] 送信内容:\n", JSON.stringify(data, null, 2));
      return;
    }
    if (!APP_INGEST_URL || !KPI_INGEST_SECRET) throw new Error("APP_INGEST_URL / KPI_INGEST_SECRET 未設定");
    const res = await fetch(APP_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KPI_INGEST_SECRET}` },
      body: JSON.stringify({ as_of: data.asOf, data }),
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`送信失敗 ${res.status}: ${txt}`);
    console.log("送信成功:", txt);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
