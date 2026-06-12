import { PREOPEN_DAYS } from "@/lib/preopen";

export type RosterBar = {
  name: string; // 姓
  start: string; // "HH:MM"
  end: string;
  isTraining: boolean;
};

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function band(c: string) {
  return `color-mix(in oklab, ${c} 16%, transparent)`;
}

// タイムラインの表示範囲：13:00–22:00（受付枠の区切り＝1.5h刻み）
const TL_START = 13 * 60; // 780
const TL_SPAN = 9 * 60; // 540
const TICKS = ["13:00", "14:30", "16:00", "17:30", "19:00", "20:30", "22:00"];

// プレオープン週の出勤シフトをタイムライン表示で見せる。
// staffingByDate: 日付 → バー配列、colors: 姓 → 表示カラー。
export default function PreopenRoster({
  staffingByDate,
  colors,
}: {
  staffingByDate: Record<string, RosterBar[]>;
  colors: Record<string, string>;
}) {
  const hasAny = Object.values(staffingByDate).some((a) => a.length > 0);

  return (
    <div className="section">
      <div className="section-head">
        <h2>プレオープン週のシフト</h2>
        <span className="eyebrow">受付 火水14:30〜／木金13:00〜・最終受付19:00</span>
      </div>
      <div className="section-body">
        {!hasAny && (
          <p className="help" style={{ marginTop: 0 }}>
            シフトが未設定です。{/* オーナーは下の編集で「初期シフトに戻す」から読み込めます。 */}
          </p>
        )}
        <div className="tl">
          <div className="tl-ruler-row">
            <div className="sp" />
            <div className="tl-ruler">
              {TICKS.map((t, i, arr) => {
                const left = ((toMin(t) - TL_START) / TL_SPAN) * 100;
                const tf =
                  i === 0
                    ? "translateX(0)"
                    : i === arr.length - 1
                      ? "translateX(-100%)"
                      : "translateX(-50%)";
                return (
                  <span className="tick en" key={t} style={{ left: left + "%", transform: tf }}>
                    {t}
                  </span>
                );
              })}
            </div>
          </div>
          {PREOPEN_DAYS.map((day) => {
            const dnum = Number(day.date.split("-")[2]);
            const wd = day.label.match(/\((.)\)/)?.[1] ?? "";
            const bars = staffingByDate[day.date] ?? [];
            return (
              <div className="tl-row" key={day.date}>
                <div className="tl-day">
                  <span className="d en">{dnum}</span>
                  <span className="w">（{wd}）</span>
                </div>
                {bars.length === 0 ? (
                  <div className="tl-empty">—</div>
                ) : (
                  <div className="tl-lanes">
                    {bars.map((s, idx) => {
                      const a = toMin(s.start);
                      const b = toMin(s.end);
                      const left = ((a - TL_START) / TL_SPAN) * 100;
                      const width = ((b - a) / TL_SPAN) * 100;
                      const c = colors[s.name] ?? "#8a8a8a";
                      return (
                        <div className="tl-lane" key={s.name + idx}>
                          <div
                            className="tl-bar"
                            style={{
                              left: `${Math.max(0, left)}%`,
                              width: `${Math.min(100, width)}%`,
                              background: band(c),
                              borderLeftColor: c,
                            }}
                          >
                            <span className="nm">{s.name}</span>
                            <span className={"mk " + (s.isTraining ? "off-mk" : "late")}>
                              {s.isTraining ? "研" : "遅"}
                            </span>
                            <span className="tm">
                              {s.start}–{s.end}
                            </span>
                          </div>
                          {s.isTraining && (
                            <span
                              className="tl-note soft"
                              style={{ left: `${Math.min(100, left + width)}%` }}
                            >
                              ←研修・店舗ルール説明のみ
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="help" style={{ marginBottom: 0 }}>
          「研」＝研修のみ（施術なし）。21:00上がりは最終施術（19:00枠）後の閉め作業込み。
        </p>
      </div>
    </div>
  );
}
