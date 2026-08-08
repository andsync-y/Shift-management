// =====================================================================
// 労働時間の共通ルール（拘束 ↔ 実働）
// =====================================================================
// 「拘束時間」= 出勤〜退勤（シフトの開始〜終了）。
// 「実働時間」= 拘束から休憩を差し引いた、賃金の対象になる時間。
//
// シフト作成（予定）と給与計算（実績）で休憩の扱いがズレると、
// 「シフトは912h なのに給与は727h」のような比較不能な数字が出てしまう。
// 休憩ルールはここ一箇所に置き、両方から使う。
// =====================================================================

// 労基法34条の下限（6時間超→45分・8時間超→60分）。当店は8時間超を60分で運用。
const BREAK_OVER_8H = 60;
const BREAK_OVER_6H = 45;

/** その日の拘束（分）に対して自動控除する休憩（分）。 */
export function breakMinutesFor(rawMin: number): number {
  if (rawMin > 480) return BREAK_OVER_8H;
  if (rawMin > 360) return BREAK_OVER_6H;
  return 0;
}

/** 拘束（分）→ 実働（分）。 */
export function netMinutesFor(rawMin: number): number {
  return Math.max(0, rawMin - breakMinutesFor(rawMin));
}

/** "HH:MM" → 0時からの分。 */
export function toMinutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/** 0時からの分 → "HH:MM"。 */
export function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** シフト（開始〜終了）の拘束時間（h）。 */
export function clockedHours(start: string, end: string): number {
  return (toMinutes(end) - toMinutes(start)) / 60;
}

/** シフト（開始〜終了）の実働時間（h）＝休憩控除後。 */
export function netHours(start: string, end: string): number {
  return netMinutesFor(toMinutes(end) - toMinutes(start)) / 60;
}

// --- 1日の所定シフト長でのトリム ---------------------------------------
// 正社員のように「1日◯時間勤務」が決まっている人は、必要人数の枠が
// それより長くてもその長さに収める。どちら側を残すかは、店の
// オープン/クローズが空かないよう決める：
//   遅番（終わりが遅いシフト）は終わりを固定して開始を遅らせる。
//   それ以外（早番）は開始を固定して終わりを早める。
const LATE_SHIFT_ENDS_FROM = 20 * 60; // 20:00以降に終わるものは遅番扱い

/**
 * 拘束が capHours を超えるシフトを capHours ちょうどに縮める。
 * capHours が未設定（null/0以下）か、元々短い場合はそのまま返す。
 */
export function capShiftLength(
  start: string,
  end: string,
  capHours: number | null | undefined
): { start: string; end: string } {
  if (!capHours || capHours <= 0) return { start, end };
  const s = toMinutes(start);
  const e = toMinutes(end);
  const cap = Math.round(capHours * 60);
  if (e - s <= cap) return { start, end };
  return e >= LATE_SHIFT_ENDS_FROM
    ? { start: toHHMM(e - cap), end }
    : { start, end: toHHMM(s + cap) };
}

// --- 週の区切り -------------------------------------------------------

/**
 * その日付が属する週（月曜始まり）の月曜日を "YYYY-MM-DD" で返す。
 * 週上限や社保の週30時間は暦の週（月〜日）で見る必要がある。
 * 「1日〜7日」のような月内の固定バケットで数えると、月初の曜日によって
 * 2つの実際の週にまたがり、判定がすり抜ける。
 */
export function mondayKey(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  const offset = (d.getUTCDay() + 6) % 7; // 月曜からの経過日数
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

/**
 * 月の労働時間から週平均を出す（月 × 12 ヶ月 ÷ 52 週）。
 * 社保の「週の所定労働時間」はこの換算で見るのが実務の通例。
 * 月内の週数で単純に割ると、月末の半端な週の分だけ平均が低く出て、
 * 30時間の判定が甘くなる。
 */
export function weeklyAverageFromMonthly(monthlyHours: number): number {
  return (monthlyHours * 12) / 52;
}

/** 「8.5h勤務（実働7.5h）」のような表示用ラベル。 */
export function shiftLengthLabel(capHours: number): string {
  const net = netMinutesFor(Math.round(capHours * 60)) / 60;
  return `${capHours}h勤務（実働${net}h）`;
}
