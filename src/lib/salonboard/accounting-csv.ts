// =====================================================================
// サロンボードの「会計データ」CSVを集計する
// =====================================================================
// 給与の指名バック・回数券バックは本部システム(zn-stretch)の担当別売上から
// 取り込んでいるが、あちらは**スタッフの手入力**なので誤りが混じりうる。
// サロンボードは実際の会計そのものなので、こちらを正として突き合わせる。
//
// 列（サロンボードのCSV・Shift_JIS・1会計が複数行に分かれる）:
//   会計日, 会計時間, 会計ID, 会計区分, 区分, ジャンル, カテゴリ,
//   メニュー・店販・割引・サービス・オプション, 単価, 単価区分, 個数, 金額,
//   スタッフ, 指名, お客様名, お客様番号, お客様名（フリガナ）, 予約経路, 性別, 新規再来
//
// 数え方の要点:
//   - 1会計ID = 1来店。施術＋オプションで複数行になるので会計単位に畳む。
//   - 取り消しは「元の売上」と「会計区分=取り消し会計のマイナス行」の対で残る。
//     **個数が -1 で入る**ので、回数券の本数は個数をそのまま合計すれば正味になる。
//     （符号を金額から取って掛けると二重に効いて +1 になるので注意）
//   - 「指名3回券」などの指名チケットの前売りは回数券バックの対象外。
// =====================================================================

import { parseCsv } from "@/lib/fc-hq/visits-csv";

export interface SalonBoardTally {
  staff: string; // サロンボードの「スタッフ」表記
  visits: number; // 来店数（会計数・取消除く）
  newVisits: number; // うち新規
  nominations: number; // 指名数（指名ありの会計数）＝指名バックの対象
  kaisuken: number; // 回数券の販売本数（取消を差し引いた正味）＝回数券バックの対象
  nominationTickets: number; // 指名回数券の前売り本数（バック対象外・参考）
}

export interface SalonBoardResult {
  month: string;
  totalRows: number;
  monthRows: number;
  canceledAccounts: number; // 取り消し会計の数
  tallies: SalonBoardTally[];
  monthsInCsv: string[];
}

/** "20260801" → "2026-08" */
function toMonth(ymd: string): string {
  const s = (ymd ?? "").trim();
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}` : "";
}

function toInt(s: string | undefined): number {
  const n = Number(String(s ?? "").replace(/[^0-9-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 施術の回数券か（「指名3回券」などの指名チケットは除く）。 */
export function isKaisukenMenu(menu: string | undefined): boolean {
  const m = (menu ?? "").trim();
  return /\d+\s*回券/.test(m) && !m.startsWith("指名");
}

/** 指名チケットの前売りか（「指名5回券」など）。 */
export function isNominationTicketMenu(menu: string | undefined): boolean {
  const m = (menu ?? "").trim();
  return m.startsWith("指名") && /\d+\s*回券/.test(m);
}

const MENU_COL = "メニュー・店販・割引・サービス・オプション";

export function tallySalonBoardCsv(text: string, month: string): SalonBoardResult {
  const rows = parseCsv(text);
  const empty: SalonBoardResult = {
    month,
    totalRows: 0,
    monthRows: 0,
    canceledAccounts: 0,
    tallies: [],
    monthsInCsv: [],
  };
  if (rows.length < 2) return empty;

  const head = rows[0].map((h) => h.trim());
  const col = (name: string) => head.indexOf(name);
  const iDate = col("会計日");
  const iId = col("会計ID");
  const iKubun = col("会計区分");
  const iMenu = col(MENU_COL);
  const iQty = col("個数");
  const iStaff = col("スタッフ");
  const iNom = col("指名");
  const iNew = col("新規再来");
  if (iDate < 0 || iId < 0 || iStaff < 0 || iMenu < 0) {
    throw new Error(
      "サロンボードCSVの列が見つかりません（会計日・会計ID・スタッフ・メニューが必要です）。"
    );
  }

  const body = rows.slice(1);
  const monthsInCsv = [...new Set(body.map((r) => toMonth(r[iDate])).filter(Boolean))].sort();
  const inMonth = body.filter((r) => toMonth(r[iDate]) === month);

  // 取り消し会計の会計IDは来店・指名の集計から外す（回数券は個数の符号で相殺されるので触らない）
  const canceled = new Set(
    inMonth.filter((r) => (r[iKubun] ?? "").trim() === "取り消し会計").map((r) => r[iId])
  );

  const map = new Map<string, SalonBoardTally>();
  const get = (staff: string) => {
    let t = map.get(staff);
    if (!t) {
      t = { staff, visits: 0, newVisits: 0, nominations: 0, kaisuken: 0, nominationTickets: 0 };
      map.set(staff, t);
    }
    return t;
  };

  // 回数券は行単位（個数が符号つき）
  for (const r of inMonth) {
    const staff = (r[iStaff] ?? "").trim();
    if (!staff) continue;
    const t = get(staff);
    const qty = iQty >= 0 ? toInt(r[iQty]) : 1;
    if (isKaisukenMenu(r[iMenu])) t.kaisuken += qty;
    else if (isNominationTicketMenu(r[iMenu])) t.nominationTickets += qty;
  }

  // 来店・指名は会計単位（1会計＝1来店）
  const accounts = new Map<string, { staff: string; nominated: boolean; isNew: boolean }>();
  for (const r of inMonth) {
    const id = r[iId];
    if (!id || canceled.has(id)) continue;
    const staff = (r[iStaff] ?? "").trim();
    if (!staff) continue;
    let a = accounts.get(id);
    if (!a) {
      a = { staff, nominated: false, isNew: (r[iNew] ?? "").trim() === "新規" };
      accounts.set(id, a);
    }
    if (iNom >= 0 && (r[iNom] ?? "").trim() === "指名あり") a.nominated = true;
  }
  for (const a of accounts.values()) {
    const t = get(a.staff);
    t.visits += 1;
    if (a.nominated) t.nominations += 1;
    if (a.isNew) t.newVisits += 1;
  }

  const tallies = [...map.values()].sort(
    (a, b) => b.kaisuken - a.kaisuken || b.nominations - a.nominations || a.staff.localeCompare(b.staff)
  );
  return {
    month,
    totalRows: body.length,
    monthRows: inMonth.length,
    canceledAccounts: canceled.size,
    tallies,
    monthsInCsv,
  };
}
