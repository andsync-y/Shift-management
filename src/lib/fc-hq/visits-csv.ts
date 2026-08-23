// =====================================================================
// 本部システム(zn-stretch)の「来店記録」CSVを集計する
// =====================================================================
// 給与の回数券バックは「当月の回数券販売本数」で決まるが、これまで給与画面に
// 手入力していた。来店記録CSVは1行1来店で「担当」「来店種別」「回数券購入」を
// 持つので、そこから担当別に数えて給与に取り込む。
//
// 列（本部システムのCSV・UTF-8 BOM付き・CRLF）:
//   来店日, 顧客名, 顧客ID, 性別, 年代, 担当, 来店種別, 来店経路, 指名,
//   コース, 延長, 次回予約, 回数券購入, 指名チケット, 備考,
//   施術売上, 回数券売上, 指名売上, 合計売上
//
// 数え方: 「回数券購入」に券種が入っている行を 1本 と数える（回数ではない）。
//   来店種別で絞らないのは、回数券が売れるのは 新規 と 更新（ラスト1枚／途中更新）
//   だけとは限らず、チケ消化中・都度からの更新も同じ1本だから。
//   実データ（2026-07）は 新規23本＋更新1本＝24本 で、本部の月次記録と一致する。
// =====================================================================

/** 指名料の単価（円）。指名売上をこれで割ると指名本数になる。 */
export const NOMINATION_UNIT_PRICE = 3300;

export interface StaffTally {
  staff: string; // CSVの「担当」表記（AINA など）
  kaisuken: number; // 回数券の販売本数
  kaisukenYen: number; // 回数券売上
  nomination: number; // 指名本数（指名売上 ÷ 3,300）※給与の指名バックとは定義が違う点に注意
  newVisits: number; // 新規の接客数
  newWithTicket: number; // うち回数券が売れた件数
}

export interface VisitTallyResult {
  month: string;
  totalRows: number; // CSV全体の行数
  monthRows: number; // 対象月の行数
  tallies: StaffTally[]; // 担当別（回数券の多い順）
  totalKaisuken: number;
  /** 回数券が売れた行の来店種別の内訳（新規: 23, ラスト1枚／途中更新: 1 など） */
  kaisukenByKind: Record<string, number>;
  /** CSVに含まれる月の一覧（対象月が0件のときの案内用） */
  monthsInCsv: string[];
}

/** RFC4180 準拠の最小CSVパーサ（引用符・改行入りセルに対応）。 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, ""); // BOM除去
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}

/** 「3回券(60分)」→ 3 / 空欄や不明は 0。 */
export function ticketCount(s: string | undefined): number {
  const m = /(\d+)\s*回券/.exec(s ?? "");
  return m ? Number(m[1]) : 0;
}

function yen(s: string | undefined): number {
  const n = Number(String(s ?? "").replace(/[^0-9-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 来店記録CSVを対象月（"YYYY-MM"）で絞り、担当別に集計する。 */
export function tallyVisitCsv(text: string, month: string): VisitTallyResult {
  const rows = parseCsv(text);
  const empty: VisitTallyResult = {
    month,
    totalRows: 0,
    monthRows: 0,
    tallies: [],
    totalKaisuken: 0,
    kaisukenByKind: {},
    monthsInCsv: [],
  };
  if (rows.length < 2) return empty;

  const head = rows[0].map((h) => h.trim());
  const col = (name: string) => head.indexOf(name);
  const iDate = col("来店日");
  const iStaff = col("担当");
  const iKind = col("来店種別");
  const iTicket = col("回数券購入");
  const iTicketYen = col("回数券売上");
  const iNomYen = col("指名売上");
  if (iDate < 0 || iStaff < 0 || iTicket < 0) {
    throw new Error("来店記録CSVの列が見つかりません（来店日・担当・回数券購入が必要です）。");
  }

  const body = rows.slice(1);
  const monthsInCsv = [...new Set(body.map((r) => (r[iDate] ?? "").slice(0, 7)).filter(Boolean))].sort();

  const map = new Map<string, StaffTally>();
  const get = (staff: string) => {
    let t = map.get(staff);
    if (!t) {
      t = { staff, kaisuken: 0, kaisukenYen: 0, nomination: 0, newVisits: 0, newWithTicket: 0 };
      map.set(staff, t);
    }
    return t;
  };

  const kaisukenByKind: Record<string, number> = {};
  let monthRows = 0;
  for (const r of body) {
    if ((r[iDate] ?? "").slice(0, 7) !== month) continue;
    monthRows++;
    const staff = (r[iStaff] ?? "").trim();
    if (!staff) continue;
    const t = get(staff);
    const kind = iKind >= 0 ? (r[iKind] ?? "").trim() : "";
    const sold = ticketCount(r[iTicket]) > 0;
    if (sold) {
      t.kaisuken += 1; // 「本数」なので券の回数ではなく1件として数える
      t.kaisukenYen += yen(r[iTicketYen]);
      const k = kind || "(不明)";
      kaisukenByKind[k] = (kaisukenByKind[k] ?? 0) + 1;
    }
    if (kind === "新規") {
      t.newVisits += 1;
      if (sold) t.newWithTicket += 1;
    }
    if (iNomYen >= 0) t.nomination += Math.round(yen(r[iNomYen]) / NOMINATION_UNIT_PRICE);
  }

  const tallies = [...map.values()].sort((a, b) => b.kaisuken - a.kaisuken || a.staff.localeCompare(b.staff));
  return {
    month,
    totalRows: body.length,
    monthRows,
    tallies,
    totalKaisuken: tallies.reduce((s, t) => s + t.kaisuken, 0),
    kaisukenByKind,
    monthsInCsv,
  };
}
