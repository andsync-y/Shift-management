import { PREOPEN_DAYS } from "@/lib/preopen";

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function band(c: string) {
  return `color-mix(in oklab, ${c} 16%, transparent)`;
}

// プレオープン週の出勤シフトを、通常のシフト表と同じタイムライン表示で見せる。
// colors: 姓 → 表示カラー。
export default function PreopenRoster({ colors }: { colors: Record<string, string> }) {
  const ticks = [10, 12, 14, 16, 18, 20, 22];
  return (
    <div className="section">
      <div className="section-head">
        <h2>プレオープン週のシフト</h2>
        <span className="eyebrow">受付 火水14:30〜／木金13:00〜・最終受付19:00</span>
      </div>
      <div className="section-body">
        <div className="tl">
          <div className="tl-ruler-row">
            <div className="sp" />
            <div className="tl-ruler">
              {ticks.map((h, i, arr) => {
                const left = ((h - 10) / 12) * 100;
                const tf =
                  i === 0
                    ? "translateX(0)"
                    : i === arr.length - 1
                      ? "translateX(-100%)"
                      : "translateX(-50%)";
                return (
                  <span className="tick en" key={h} style={{ left: left + "%", transform: tf }}>
                    {h}
                  </span>
                );
              })}
            </div>
          </div>
          {PREOPEN_DAYS.map((day) => {
            const dnum = Number(day.date.split("-")[2]);
            const wd = day.label.match(/\((.)\)/)?.[1] ?? "";
            return (
              <div className="tl-row" key={day.date}>
                <div className="tl-day">
                  <span className="d en">{dnum}</span>
                  <span className="w">（{wd}）</span>
                </div>
                <div className="tl-lanes">
                  {day.staffing.map((s) => {
                    const a = toMin(s.start);
                    const b = toMin(s.end);
                    const left = ((a - 600) / 720) * 100;
                    const width = ((b - a) / 720) * 100;
                    const c = colors[s.name] ?? "#8a8a8a";
                    const training = s.serveEnd === null;
                    return (
                      <div className="tl-lane" key={s.name}>
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
                          <span className={"mk " + (training ? "off-mk" : "late")}>
                            {training ? "研" : "遅"}
                          </span>
                          <span className="tm">
                            {s.start}–{s.end}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
