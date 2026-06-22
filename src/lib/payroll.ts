// =====================================================================
// 給与計算（実打刻ベース）
// =====================================================================
// 集計元: time_records（出勤 clock_in 〜 退勤 clock_out, JST）。
// ルール:
//  - 休憩自動控除: その日の実働が 8時間超→60分 / 6時間超→45分 を差し引く。
//  - 残業: 1日の実働(休憩控除後)が8時間を超えた分は 1.25倍（割増 +0.25）。
//  - 深夜: 22:00〜翌5:00(JST) の労働に +0.25 の加算。
//  - 総支給 = 基本(全労働×時給) + 残業割増 + 深夜割増 + 交通費(月額)。
// すべて分単位で集計し、最後に円へ丸める（四捨五入）。
// =====================================================================

const DAY = 86400000;
const HOUR = 3600000;
const JST = 9 * HOUR;

export interface PayrollRecord {
  work_date: string; // "YYYY-MM-DD"（JST出勤日）
  clock_in: string | null;
  clock_out: string | null;
}

export interface DayBreakdown {
  date: string;
  inOut: { in: string; out: string }[]; // "HH:MM"（JST）
  workedMin: number; // 実働(休憩控除後)
  breakMin: number;
  overtimeMin: number;
  nightMin: number;
  wage: number; // その日に適用された時給
}

export interface PayrollResult {
  workedMin: number; // 実働合計(休憩控除後)
  overtimeMin: number;
  nightMin: number;
  breakMin: number;
  openCount: number; // 退勤打刻が無い（打刻中）件数
  basePay: number; // 全労働×時給
  overtimePay: number; // 残業割増(+0.25分)
  nightPay: number; // 深夜割増(+0.25分)
  commute: number; // 交通費(月額)
  gross: number; // 総支給(額面)
  days: DayBreakdown[];
}

function overlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(a2, b2) - Math.max(b1, a1));
}

// [start,end] のうち 22:00〜翌5:00(JST) に入る分数。
function nightMinutes(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  const s = startMs + JST;
  const e = endMs + JST; // JST空間（00:00が日境界）
  let total = 0;
  const firstDay = Math.floor(s / DAY);
  const lastDay = Math.floor(e / DAY);
  for (let d = firstDay; d <= lastDay; d++) {
    const base = d * DAY;
    total += overlap(s, e, base + 22 * HOUR, base + 24 * HOUR); // 22:00-24:00
    total += overlap(s, e, base + 0, base + 5 * HOUR); // 00:00-05:00
  }
  return Math.round(total / 60000);
}

function hmJst(ms: number): string {
  const j = new Date(ms + JST);
  return `${String(j.getUTCHours()).padStart(2, "0")}:${String(j.getUTCMinutes()).padStart(2, "0")}`;
}

// 期間別の時給（全員一律）。この範囲内はスタッフ個別の時給より優先する。
export interface WageRange {
  from: string; // "YYYY-MM-DD"（含む）
  to: string; // "YYYY-MM-DD"（含む）
  wage: number;
}
export const WAGE_SCHEDULE: WageRange[] = [
  { from: "2026-06-08", to: "2026-06-19", wage: 1060 },
  { from: "2026-06-20", to: "2026-07-31", wage: 1600 },
];

// その日の時給。期間スケジュールに該当すればその額、無ければ各自の時給(fallback)。
export function wageForDate(date: string, fallback: number): number {
  for (const r of WAGE_SCHEDULE) {
    if (date >= r.from && date <= r.to) return r.wage;
  }
  return fallback;
}

export function computePayroll(
  records: PayrollRecord[],
  wage: number | null,
  commute = 0
): PayrollResult {
  // 日付ごとに集計
  const byDate = new Map<string, PayrollRecord[]>();
  let openCount = 0;
  for (const r of records) {
    if (r.clock_in && !r.clock_out) openCount++;
    if (!r.clock_in || !r.clock_out) continue;
    if (!byDate.has(r.work_date)) byDate.set(r.work_date, []);
    byDate.get(r.work_date)!.push(r);
  }

  const days: DayBreakdown[] = [];
  let workedMin = 0;
  let overtimeMin = 0;
  let nightMin = 0;
  let breakTotal = 0;
  // 時給が日によって変わるため、賃金は日ごとに計算して合算する。
  let baseYen = 0;
  let overtimeYen = 0;
  let nightYen = 0;
  const fallback = wage ?? 0;

  for (const date of [...byDate.keys()].sort()) {
    const recs = byDate.get(date)!;
    let rawMin = 0;
    let dayNight = 0;
    const inOut: { in: string; out: string }[] = [];
    for (const r of recs) {
      const inMs = new Date(r.clock_in!).getTime();
      const outMs = new Date(r.clock_out!).getTime();
      rawMin += Math.max(0, Math.round((outMs - inMs) / 60000));
      dayNight += nightMinutes(inMs, outMs);
      inOut.push({ in: hmJst(inMs), out: hmJst(outMs) });
    }
    const brk = rawMin > 480 ? 60 : rawMin > 360 ? 45 : 0;
    const net = Math.max(0, rawMin - brk);
    const ot = Math.max(0, net - 480);
    const night = Math.min(dayNight, net); // 念のため実働を超えないよう丸める
    const wageDay = wageForDate(date, fallback);

    workedMin += net;
    overtimeMin += ot;
    nightMin += night;
    breakTotal += brk;
    baseYen += (net / 60) * wageDay;
    overtimeYen += (ot / 60) * wageDay * 0.25;
    nightYen += (night / 60) * wageDay * 0.25;
    days.push({ date, inOut, workedMin: net, breakMin: brk, overtimeMin: ot, nightMin: night, wage: wageDay });
  }

  const basePay = Math.round(baseYen);
  const overtimePay = Math.round(overtimeYen);
  const nightPay = Math.round(nightYen);
  const gross = basePay + overtimePay + nightPay + (commute || 0);

  return {
    workedMin,
    overtimeMin,
    nightMin,
    breakMin: breakTotal,
    openCount,
    basePay,
    overtimePay,
    nightPay,
    commute: commute || 0,
    gross,
    days,
  };
}

export function hhmm(min: number): string {
  return `${Math.floor(min / 60)}時間${min % 60}分`;
}
