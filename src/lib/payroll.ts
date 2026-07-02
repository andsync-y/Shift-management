// =====================================================================
// 給与計算（実打刻ベース）
// =====================================================================
// 集計元: time_records（出勤 clock_in 〜 退勤 clock_out, JST）。
// ルール:
//  - 休憩自動控除: その日の実働が 8時間超→60分 / 6時間超→45分 を差し引く。
//  - 端数: 1日の実働(休憩控除後)を 15分単位で四捨五入してから賃金計算する。
//          深夜分も同様に15分単位で四捨五入する。
//  - 残業: 1日の実働(15分丸め後)が8時間を超えた分は 1.25倍（割増 +0.25）。
//  - 深夜: 22:00〜翌5:00(JST) の労働に +0.25 の加算。
//  - 総支給 = 基本(全労働×時給) + 残業割増 + 深夜割増 + 交通費(月額)。
// すべて分単位で集計し、最後に円へ丸める（四捨五入）。
// =====================================================================

const DAY = 86400000;
const HOUR = 3600000;
const JST = 9 * HOUR;

// 分を15分単位に四捨五入する（給与の端数処理）。
function round15(min: number): number {
  return Math.round(min / 15) * 15;
}

// その日付が属する週（月曜始まり）の月曜日を "YYYY-MM-DD" で返す。
function mondayKey(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const offset = (d.getUTCDay() + 6) % 7; // 月曜からの経過日数
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

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
  clockedMin: number; // 拘束合計(出勤〜退勤・休憩控除前・丸めなし)
  workedMin: number; // 実働合計(休憩控除後)
  overtimeMin: number;
  nightMin: number;
  breakMin: number;
  avgWeeklyMin: number; // 週平均の実働(分)。月内の各週(月〜日)合計の平均。社保加入判定の目安。
  weekCount: number; // 集計に使った週数(勤務のあった週)
  openCount: number; // 退勤打刻が無い（打刻中）件数
  basePay: number; // 全労働×時給
  overtimePay: number; // 残業割増(+0.25分)
  nightPay: number; // 深夜割増(+0.25分)
  commute: number; // 交通費(当月)
  workedDays: number; // 当月の勤務日数(実打刻で出退勤がそろった日)
  gross: number; // 総支給(額面)
  days: DayBreakdown[];
}

// 交通費の距離単価（円/km・片道1km）。往復で×2される。
export const COMMUTE_RATE_PER_KM = 15;

// 指名バック単価（円/指名）。全スタッフ共通の固定額（指名料の税抜相当・税引後100%還元）。
export const NOMINATION_BACK_RATE = 3000;

// 回数券バック（本数連動の段階単価・円/本）。
// 当月の回数券販売本数（新規＋更新）に応じて 1本あたりの単価が上がる。
// 判定は「販売率(%)」ではなく「本数（絶対数）」＝多く売るほど単価UP・新規を取る動機と同方向。
export interface KaisukenTier {
  min: number; // この本数以上で
  rate: number; // 1本あたり(円)
}
export const KAISUKEN_BACK_TIERS: KaisukenTier[] = [
  { min: 8, rate: 3000 },
  { min: 4, rate: 2000 },
  { min: 1, rate: 1000 },
];

// 回数券バックの1本あたり単価（本数で決まる）。0本なら0。
export function kaisukenBackRate(count: number): number {
  for (const t of KAISUKEN_BACK_TIERS) if (count >= t.min) return t.rate;
  return 0;
}

// 回数券バック総額 = 単価(本数で決まる) × 本数。
export function kaisukenBack(count: number): number {
  const n = Math.max(0, Math.round(count) || 0);
  return kaisukenBackRate(n) * n;
}

// 売上連動の時給テーブル（個人の月間売上=指名抜き に応じた時給）。
// フロア¥1,600（〜80万）。基本給からの減額はしない方針＝これが最低保証。
// ⚠️ 現状 computePayroll は WAGE_SCHEDULE（期間別フラット・下記）で¥1,600フロアを適用する。
//    80万超の上位段は、個人別の月間売上（FC KPI 担当別売上 / サロンボード / Square）を
//    給与計算に接続した段階で wageForSales を用いて反映する。
export interface SalesWageTier {
  upTo: number | null; // 売上上限(円・含む)。null=上限なし（最上段）
  wage: number;
}
export const SALES_WAGE_TABLE: SalesWageTier[] = [
  { upTo: 800000, wage: 1600 },
  { upTo: 900000, wage: 1800 },
  { upTo: 1000000, wage: 2000 },
  { upTo: 1100000, wage: 2200 },
  { upTo: 1200000, wage: 2400 },
  { upTo: 1300000, wage: 2600 },
  { upTo: 1400000, wage: 2800 },
  { upTo: null, wage: 3000 },
];

// 個人の月間売上(指名抜き・円)に応じた時給。フロア¥1,600。
export function wageForSales(monthlySales: number): number {
  for (const t of SALES_WAGE_TABLE) if (t.upTo == null || monthlySales <= t.upTo) return t.wage;
  return 1600;
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
  { from: "2026-06-08", to: "2026-06-19", wage: 1060 }, // 講習期間（最低賃金）
  { from: "2026-06-20", to: "2026-07-31", wage: 1600 }, // 営業研修期間（¥1,600保証）
  // 8/1〜 は時給フロア¥1,600（恒久・減額なし）。80万超の売上連動UPは wageForSales で反映（売上接続後）。
  { from: "2026-08-01", to: "2099-12-31", wage: 1600 },
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
  commuteFlat = 0,
  commuteDistanceKm = 0,
  commuteRatePerKm = COMMUTE_RATE_PER_KM
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
  let clockedMin = 0;
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
    // 休憩控除後の実働を15分単位で四捨五入（この丸め後の値で賃金・残業を計算）。
    const net = round15(Math.max(0, rawMin - brk));
    const ot = Math.max(0, net - 480);
    const night = Math.min(round15(dayNight), net); // 深夜も15分丸め・実働を超えないよう抑える
    const wageDay = wageForDate(date, fallback);

    clockedMin += rawMin;
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
  // 交通費：片道距離が設定されていれば 片道×2×単価×勤務日数、無ければ月額固定。
  const workedDays = days.length;
  const commute =
    commuteDistanceKm > 0
      ? Math.round(commuteDistanceKm * 2 * commuteRatePerKm * workedDays)
      : commuteFlat || 0;
  const gross = basePay + overtimePay + nightPay + commute;

  // 週(月〜日)ごとに実働を合算し、勤務のあった週で平均する＝週平均労働時間。
  const weekTotals = new Map<string, number>();
  for (const d of days) {
    const wk = mondayKey(d.date);
    weekTotals.set(wk, (weekTotals.get(wk) ?? 0) + d.workedMin);
  }
  const weekCount = weekTotals.size;
  const avgWeeklyMin = weekCount
    ? Math.round([...weekTotals.values()].reduce((a, b) => a + b, 0) / weekCount)
    : 0;

  return {
    clockedMin,
    workedMin,
    overtimeMin,
    nightMin,
    breakMin: breakTotal,
    avgWeeklyMin,
    weekCount,
    openCount,
    basePay,
    overtimePay,
    nightPay,
    commute: commute || 0,
    workedDays,
    gross,
    days,
  };
}

export function hhmm(min: number): string {
  return `${Math.floor(min / 60)}時間${min % 60}分`;
}
