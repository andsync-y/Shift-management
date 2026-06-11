import { PREOPEN_DAYS } from "@/lib/preopen";

// プレオープン週の出勤シフト表（閲覧専用）。
export default function PreopenRoster() {
  return (
    <div className="section">
      <div className="section-head">
        <h2>プレオープン週のシフト</h2>
        <span className="eyebrow">受付 火水14:30〜／木金13:00〜・最終受付19:00</span>
      </div>
      <div className="section-body" style={{ overflowX: "auto", paddingTop: 10 }}>
        <table className="staff-table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ whiteSpace: "nowrap" }}>日付</th>
              <th>出勤</th>
            </tr>
          </thead>
          <tbody>
            {PREOPEN_DAYS.map((day) => (
              <tr key={day.date}>
                <td style={{ whiteSpace: "nowrap", verticalAlign: "top", fontWeight: 600 }}>
                  {day.label}
                  {day.note && (
                    <div className="help" style={{ margin: "4px 0 0", fontWeight: 400 }}>
                      {day.note}
                    </div>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
                    {day.staffing.map((s) => (
                      <span key={s.name} style={{ whiteSpace: "nowrap" }}>
                        <b>{s.name}</b>{" "}
                        <span className="en">
                          {s.start}–{s.end}
                        </span>
                        {s.note && (
                          <span className="soft" style={{ fontSize: 12 }}>
                            （{s.note}）
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="help" style={{ marginBottom: 0 }}>
          21:00上がりは最終施術（19:00枠）後の閉め作業まで。研修のみの日は施術に入りません。
        </p>
      </div>
    </div>
  );
}
