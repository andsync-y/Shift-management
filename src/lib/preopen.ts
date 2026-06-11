// プレオープン（簡易予約システム）の固定設定。
// 3日間・各ラウンドはベッド4台ぶん（PREOPEN_BEDS）まで。施術90分前提。

export const PREOPEN_BEDS = 4;

export type PreopenRound = { start: string; end: string }; // "HH:MM"
export type PreopenDay = {
  date: string; // "YYYY-MM-DD"
  label: string; // "6/17(水)"
  note?: string; // 研修などの補足
  rounds: PreopenRound[];
};

export const PREOPEN_DAYS: PreopenDay[] = [
  {
    date: "2026-06-17",
    label: "6/17(水)",
    note: "13:00–15:00 研修・店舗ルール①",
    rounds: [
      { start: "15:00", end: "16:30" },
      { start: "16:30", end: "18:00" },
    ],
  },
  {
    date: "2026-06-18",
    label: "6/18(木)",
    note: "13:00–15:00 研修・店舗ルール②",
    rounds: [
      { start: "15:00", end: "16:30" },
      { start: "16:30", end: "18:00" },
    ],
  },
  {
    date: "2026-06-19",
    label: "6/19(金)",
    note: "13:00–18:00 実地",
    rounds: [
      { start: "13:00", end: "14:30" },
      { start: "14:30", end: "16:00" },
      { start: "16:00", end: "17:30" },
    ],
  },
];

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
