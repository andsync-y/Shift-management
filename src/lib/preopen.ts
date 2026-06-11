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

// "HH:MM" に分を足す（ゼロ埋め固定幅なので文字列比較で前後判定できる）
function addMinutes(t: string, mins: number): string {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

// 受付開始 start から90分刻みで、終了が閉店(close)を超えない範囲のラウンドを作る。
function buildRounds(start: string, close = "22:00", stepMin = 90): PreopenRound[] {
  const rounds: PreopenRound[] = [];
  let s = start;
  for (;;) {
    const e = addMinutes(s, stepMin);
    if (e > close) break;
    rounds.push({ start: s, end: e });
    s = e;
  }
  return rounds;
}

export const PREOPEN_DAYS: PreopenDay[] = [
  // 6/17・6/18 は受付開始15:00、6/19 は13:30。いずれも閉店22:00まで90分刻み。
  { date: "2026-06-17", label: "6/17(水)", rounds: buildRounds("15:00") },
  { date: "2026-06-18", label: "6/18(木)", rounds: buildRounds("15:00") },
  { date: "2026-06-19", label: "6/19(金)", rounds: buildRounds("13:30") },
];

// 全日通しの受付開始時刻（重複なし・昇順）。空き状況表の列に使う。
export const PREOPEN_ALL_STARTS: string[] = Array.from(
  new Set(PREOPEN_DAYS.flatMap((d) => d.rounds.map((r) => r.start)))
).sort();

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
