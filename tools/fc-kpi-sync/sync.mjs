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
import Encoding from "encoding-japanese";
import fs from "node:fs";

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

async function tryClickAny(page, selectors, timeout = 2500) {
  for (const sel of selectors) {
    try {
      await page.click(sel, { timeout });
      return sel;
    } catch {
      /* 次の候補 */
    }
  }
  return null;
}

async function login(page) {
  if (!FC_LOGIN_URL) throw new Error("FC_LOGIN_URL 未設定");
  page.setDefaultTimeout(15000);
  await page.goto(FC_LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // デバッグ: 入力欄・ボタンを列挙（ログでセレクタを確認するため）
  try {
    const fields = await page.$$eval("input", (els) =>
      els.map((e) => ({ name: e.name, type: e.type, id: e.id, ph: e.placeholder }))
    );
    const buttons = await page.$$eval("button, input[type=submit], [role=button], a", (els) =>
      els.slice(0, 40).map((e) => ({ tag: e.tagName, type: e.type || "", text: (e.innerText || e.value || "").trim().slice(0, 24) }))
    );
    console.log("LOGIN URL:", page.url());
    console.log("LOGIN FIELDS:", JSON.stringify(fields));
    console.log("LOGIN BUTTONS:", JSON.stringify(buttons));
  } catch (e) {
    console.warn("debug dump 失敗:", e.message);
  }

  await page.fill(SELECTORS.user, FC_USER).catch((e) => console.warn("user fill 失敗:", e.message));
  await page.fill(SELECTORS.pass, FC_PASS).catch((e) => console.warn("pass fill 失敗:", e.message));

  // 送信：ボタン候補 → ダメなら Enter キー
  const clicked = await tryClickAny(page, [
    SELECTORS.submit,
    'button:has-text("ログイン")',
    'button:has-text("ログ イン")',
    'button:has-text("サインイン")',
    'button:has-text("LOGIN")',
    'button:has-text("Login")',
    '[role="button"]:has-text("ログイン")',
    'a:has-text("ログイン")',
  ]);
  if (!clicked) {
    await page.press(SELECTORS.pass, "Enter").catch(() => {});
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2500);
  console.log("AFTER LOGIN url:", page.url(), "/ title:", await page.title().catch(() => ""));
}

// ===== 本部ダッシュボードからの読み取り =====
// SPAのCSSクラスは不定なので、テーブルを「見出し名」で探して行を読む堅牢方式にする。
// 数値: ¥ , % を除去して数値化。率は % → 0-1 に変換。

const toNum = (s) => {
  const n = Number(String(s ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const toRate = (s) => {
  const n = toNum(s);
  return n == null ? null : n / 100;
};

// 見出しに mustHave を全て含むテーブルを探し、{headers, rows} を返す。
async function readTable(page, mustHave) {
  const tables = await page.$$("table");
  for (const t of tables) {
    const headers = await t
      .$$eval("thead th, thead td, tr:first-child th, tr:first-child td", (els) =>
        els.map((e) => e.textContent.replace(/\s+/g, "").trim())
      )
      .catch(() => []);
    if (headers.length && mustHave.every((h) => headers.some((x) => x.includes(h)))) {
      const rows = await t.$$eval("tbody tr", (trs) =>
        trs.map((tr) => Array.from(tr.querySelectorAll("td,th")).map((td) => td.textContent.replace(/\s+/g, " ").trim()))
      );
      return { headers, rows };
    }
  }
  return null;
}
function colIndex(headers, name) {
  return headers.findIndex((h) => h.includes(name));
}

async function extractMonth(page) {
  // 表示期間を「今月」にしてから「店舗別売上」表（総来店数を持つ＝担当別ではない）を読む。
  try {
    await page.click("text=今月", { timeout: 5000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1200);
  } catch {
    /* 既定が今月ならそのまま */
  }
  const t = await readTable(page, ["売上", "総来店数", "指名率"]);
  const month = ymd(new Date()).slice(0, 7);
  if (!t || t.rows.length === 0) return { month, sales: null, newCount: null, newRate: null, nominationCount: null, nominationRate: null };
  const r = t.rows[0];
  const get = (name) => r[colIndex(t.headers, name)];
  return {
    month,
    sales: toNum(get("売上")),
    newCount: toNum(get("新規販売数")),
    newRate: toRate(get("新規販売率")),
    nominationCount: toNum(get("指名数")),
    nominationRate: toRate(get("指名率")),
  };
}

// 担当別売上テーブルを読み、新規販売数>0 / 指名数>0 のスタッフを返す。
async function readStaffTable(page) {
  const t = await readTable(page, ["担当", "新規販売数", "指名数"]);
  if (!t) return { newSales: [], nominations: [] };
  const iName = colIndex(t.headers, "担当");
  const iNew = colIndex(t.headers, "新規販売数");
  const iNom = colIndex(t.headers, "指名数");
  const newSales = [];
  const nominations = [];
  for (const r of t.rows) {
    const staff = (r[iName] || "").replace(/\s+/g, " ").trim();
    if (!staff) continue;
    const nNew = toNum(r[iNew]);
    const nNom = toNum(r[iNom]);
    if (nNew && nNew > 0) newSales.push({ staff, ticket: null }); // 回数券の回数は日報側のため未取得
    if (nNom && nNom > 0) nominations.push({ staff, count: nNom });
  }
  return { newSales, nominations };
}

// "3回券(60分)" → 3
function parseTicket(s) {
  const m = /(\d+)\s*回券/.exec(String(s ?? ""));
  return m ? Number(m[1]) : null;
}
// 来店記録CSV（Shift_JIS想定）をパースして行オブジェクト配列に。
function parseCsvVisits(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const o = {};
    headers.forEach((h, i) => (o[h] = (cells[i] ?? "").trim()));
    return o;
  });
}

async function extractYesterday(page) {
  const y = new Date();
  y.setUTCDate(y.getUTCDate() - 1);
  const yStr = ymd(y);

  // 来店記録のCSVをダウンロード → 昨日ぶんを集計（回数券の回数も取れる）。
  try {
    await page.click("text=来店記録", { timeout: 8000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1500);

    // デバッグ: 来店記録ページのCSV/ダウンロード系ボタンを列挙
    try {
      const dl = await page.$$eval("button, a, [role=button]", (els) =>
        els
          .map((e) => ({ tag: e.tagName, text: (e.innerText || e.value || "").trim().slice(0, 24), dl: e.getAttribute("download") }))
          .filter((x) => /csv|ダウンロード|エクスポート|export|download/i.test(x.text) || x.dl !== null)
          .slice(0, 20)
      );
      console.log("来店記録 DOWNLOAD候補:", JSON.stringify(dl));
    } catch {}

    const dlSelectors = [
      'a[download]',
      'button:has-text("CSVダウンロード")',
      'button:has-text("CSV出力")',
      'button:has-text("エクスポート")',
      'a:has-text("CSV")',
      'button:has-text("ダウンロード")',
      'button:has-text("CSV")',
    ];
    let download = null;
    for (const sel of dlSelectors) {
      try {
        const [d] = await Promise.all([
          page.waitForEvent("download", { timeout: 8000 }),
          page.click(sel, { timeout: 3000 }),
        ]);
        download = d;
        console.log("CSVダウンロード成功 selector:", sel);
        break;
      } catch {
        /* 次の候補 */
      }
    }
    if (!download) throw new Error("CSVダウンロードボタンが見つからない");
    const path = await download.path();
    const buf = fs.readFileSync(path);
    const text = Encoding.codeToString(Encoding.convert(buf, { to: "UNICODE", from: "AUTO" }));
    const rows = parseCsvVisits(text).filter((r) => (r["来店日"] || "").startsWith(yStr));

    const newSales = [];
    const nomMap = new Map();
    for (const r of rows) {
      const staff = (r["担当"] || "").trim();
      if (!staff) continue;
      const ticket = parseTicket(r["回数券購入"]);
      if (r["来店種別"] === "新規" && ticket) newSales.push({ staff, ticket });
      if ((r["指名"] || "").startsWith("あり")) nomMap.set(staff, (nomMap.get(staff) || 0) + 1);
    }
    const nominations = [...nomMap.entries()].map(([staff, count]) => ({ staff, count }));
    return { date: yStr, newSales, nominations };
  } catch (e) {
    console.warn("来店記録CSVの取得に失敗、ダッシュボード(担当別)にフォールバック:", e.message);
    try {
      await page.click("text=ダッシュボード", { timeout: 5000 });
      await page.waitForTimeout(800);
    } catch {}
    try {
      await page.click("text=昨日", { timeout: 5000 });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1500);
    } catch {}
    const { newSales, nominations } = await readStaffTable(page);
    return { date: yStr, newSales, nominations };
  }
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await login(page);
    const month = await extractMonth(page);
    const yesterday = await extractYesterday(page);
    const data = { asOf: ymd(new Date()), month, yesterday };
    console.log("DATA:", JSON.stringify(data));

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
