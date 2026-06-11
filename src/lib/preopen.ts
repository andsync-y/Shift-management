// プレオープン（簡易予約システム）の固定設定。
// 4日間（6/16–6/19）。受付は火水14:30〜／木金13:00〜、最終受付19:00（20:30終わり）。
// 受付数は「プレオープン出勤表（PREOPEN_DAYS の staffing）」と「ベッド4台」の小さい方。
// ※ 通常運用の固定シフトとは独立した、プレオープン専用の特別シフト。

export const PREOPEN_BEDS = 4;

export type PreopenRound = { start: string; end: string }; // "HH:MM"

export type PreopenShift = {
  name: string; // 表示名（姓）
  start: string; // 勤務開始 "HH:MM"
  end: string; // 勤務終了
  serveEnd: string | null; // 施術に入れる時刻の上限。null は研修のみ（施術なし）
  note?: string;
};

export type PreopenDay = {
  date: string; // "YYYY-MM-DD"
  label: string; // "6/16(火)"
  note?: string; // 研修などの補足
  rounds: PreopenRound[];
  staffing: PreopenShift[];
};

// "HH:MM" に分を足す（ゼロ埋め固定幅なので文字列比較で前後判定できる）
function addMinutes(t: string, mins: number): string {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

// 受付開始 start から90分刻みで、終了が close を超えない範囲のラウンドを作る。
function buildRounds(start: string, close = "20:30", stepMin = 90): PreopenRound[] {
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
  {
    date: "2026-06-16",
    label: "6/16(火)",
    note: "研修・店舗ルール 13:00–14:30",
    rounds: buildRounds("14:30"),
    staffing: [
      { name: "福田", start: "13:00", end: "21:00", serveEnd: "21:00" },
      { name: "佐藤", start: "13:00", end: "21:00", serveEnd: "21:00" },
      { name: "紙坂", start: "13:00", end: "19:00", serveEnd: "19:00" },
      { name: "二俣", start: "13:00", end: "14:30", serveEnd: null, note: "研修のみ" },
      { name: "川島", start: "13:00", end: "14:30", serveEnd: null, note: "研修のみ" },
    ],
  },
  {
    date: "2026-06-17",
    label: "6/17(水)",
    note: "研修・店舗ルール 13:00–14:30",
    rounds: buildRounds("14:30"),
    staffing: [
      { name: "二俣", start: "13:00", end: "21:00", serveEnd: "21:00" },
      { name: "川島", start: "13:00", end: "21:00", serveEnd: "21:00" },
      { name: "橋本", start: "13:00", end: "21:00", serveEnd: "21:00" },
      { name: "桑原", start: "13:00", end: "21:00", serveEnd: "21:00" },
    ],
  },
  {
    date: "2026-06-18",
    label: "6/18(木)",
    rounds: buildRounds("13:00"),
    staffing: [
      { name: "福田", start: "13:00", end: "21:00", serveEnd: "21:00" },
      { name: "橋本", start: "13:00", end: "21:00", serveEnd: "21:00" },
      { name: "二俣", start: "13:00", end: "16:00", serveEnd: "16:00" },
      { name: "川島", start: "13:00", end: "16:00", serveEnd: "16:00" },
    ],
  },
  {
    date: "2026-06-19",
    label: "6/19(金)",
    rounds: buildRounds("13:00"),
    staffing: [
      { name: "佐藤", start: "13:00", end: "21:00", serveEnd: "21:00" },
      { name: "桑原", start: "13:00", end: "21:00", serveEnd: "21:00" },
      { name: "紙坂", start: "13:00", end: "19:00", serveEnd: "19:00" },
    ],
  },
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

// 各枠の受付数 = min(ベッド数, 枠の開始〜終了まで施術に入れるスタッフ数)。
export function getPreopenCapacities(): Record<string, number> {
  const caps: Record<string, number> = {};
  for (const day of PREOPEN_DAYS) {
    for (const round of day.rounds) {
      const n = day.staffing.filter(
        (s) => s.serveEnd !== null && s.start <= round.start && s.serveEnd >= round.end
      ).length;
      caps[slotKey(day.date, round.start)] = Math.min(PREOPEN_BEDS, n);
    }
  }
  return caps;
}
