// プレオープン（簡易予約システム）の固定設定。
// 営業 13:00–22:00・施術90分。ベッドは PREOPEN_BEDS 台。
// 各枠の受付数は「ベッド数」と「その時間に勤務しているスタッフ数（固定シフト基準）」の
// 小さい方（src/lib/preopen-capacity.ts で算出）。

export const PREOPEN_BEDS = 4;

export type PreopenRound = { start: string; end: string }; // "HH:MM"
export type PreopenDay = {
  date: string; // "YYYY-MM-DD"
  label: string; // "6/17(水)"
  note?: string; // 補足
  rounds: PreopenRound[];
};

// 13:00〜22:00 を90分で6ラウンド
const ROUNDS: PreopenRound[] = [
  { start: "13:00", end: "14:30" },
  { start: "14:30", end: "16:00" },
  { start: "16:00", end: "17:30" },
  { start: "17:30", end: "19:00" },
  { start: "19:00", end: "20:30" },
  { start: "20:30", end: "22:00" },
];

export const PREOPEN_DAYS: PreopenDay[] = [
  { date: "2026-06-17", label: "6/17(水)", rounds: ROUNDS },
  { date: "2026-06-18", label: "6/18(木)", rounds: ROUNDS },
  { date: "2026-06-19", label: "6/19(金)", rounds: ROUNDS },
];

// 枠キー（日付＋開始時刻）。予約数・受付数のマップに使う。
export function slotKey(date: string, start: string): string {
  return `${date}_${hm(start)}`;
}

// "15:00:00" / "15:00" を "15:00" に正規化
export function hm(t: string): string {
  return t.slice(0, 5);
}

export function findRound(date: string, start: string): { day: PreopenDay; round: PreopenRound } | null {
  const day = PREOPEN_DAYS.find((d) => d.date === date);
  if (!day) return null;
  const round = day.rounds.find((r) => r.start === hm(start));
  if (!round) return null;
  return { day, round };
}
