import type { PreopenReservation } from "@/lib/types";
import { PREOPEN_ALL_STARTS, PREOPEN_DAYS, hm, slotKey } from "@/lib/preopen";

// 4日間×時間帯の空き状況（残り数）を一望できるコンパクト表。
export default function PreopenAvailability({
  reservations,
  capacities,
}: {
  reservations: PreopenReservation[];
  capacities: Record<string, number>;
}) {
  const used = (date: string, start: string) =>
    reservations.filter((r) => r.reserve_date === date && hm(r.start_time) === start).length;
  const total = reservations.length;
  const totalCap = Object.values(capacities).reduce((a, b) => a + b, 0);
  const starts = PREOPEN_ALL_STARTS;

  return (
    <div className="section">
      <div className="section-head">
        <h2>枠の空き状況</h2>
        <span className="eyebrow">
          予約 {total} / 受付 {totalCap}名 ・ セルは「残り数」
        </span>
      </div>
      <div className="section-body" style={{ overflowX: "auto", paddingTop: 10 }}>
        <table className="staff-table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ whiteSpace: "nowrap" }}>日付</th>
              {starts.map((s) => (
                <th key={s} className="en" style={{ whiteSpace: "nowrap", textAlign: "center" }}>
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PREOPEN_DAYS.map((day) => {
              const startSet = new Set(day.rounds.map((r) => r.start));
              return (
                <tr key={day.date}>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{day.label}</td>
                  {starts.map((s) => {
                    if (!startSet.has(s)) {
                      return (
                        <td key={s} style={{ textAlign: "center", color: "var(--line, #ccc)" }}>
                          ·
                        </td>
                      );
                    }
                    const cap = capacities[slotKey(day.date, s)] ?? 0;
                    const left = cap - used(day.date, s);
                    const label = cap === 0 ? "—" : left <= 0 ? "満" : `残${left}`;
                    const color =
                      cap === 0
                        ? "var(--ink-3, #9a9a93)"
                        : left <= 0
                          ? "var(--accent-ink, #b4532a)"
                          : "inherit";
                    return (
                      <td
                        key={s}
                        style={{ textAlign: "center", whiteSpace: "nowrap", color }}
                        title={cap === 0 ? "受付なし（勤務スタッフなし）" : `${cap - left}/${cap}名`}
                      >
                        {label}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="help" style={{ marginBottom: 0 }}>
          受付数は「その時間に施術に入れるスタッフ数（プレオープン出勤表）」と「ベッド4台」の小さい方。
        </p>
      </div>
    </div>
  );
}
