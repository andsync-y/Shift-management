import Link from "next/link";
import type { Profile, Shift, ShiftRequirement } from "@/lib/types";
import { DAY_LABELS_JA } from "@/lib/types";

function toMin(t: string) {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}
function hours(s: Shift) {
  return (toMin(s.end_time) - toMin(s.start_time)) / 60;
}
function hm(t: string) {
  return t.slice(0, 5);
}
function surname(name: string) {
  return name.split(/[\s　]/)[0];
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function DashboardInsights({
  periodId,
  shifts,
  staff,
  requirements,
}: {
  periodId: string | null;
  shifts: Shift[];
  staff: Profile[];
  requirements: ShiftRequirement[];
}) {
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const editHref = periodId ? `/admin/shifts/${periodId}` : "/admin/shifts";

  // ----- 今日・明日の出勤者 -----
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayBuckets = [today, tomorrow].map((d) => ({
    date: d,
    label: `${d.getMonth() + 1}/${d.getDate()}（${DAY_LABELS_JA[d.getDay()]}）`,
    list: shifts
      .filter((s) => s.work_date === ymd(d))
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
  }));
  const hasTodayData = dayBuckets.some((b) => b.list.length > 0);

  // ----- 人手不足アラート -----
  // 必要人数(曜日別の最大要件) に対し、その日の出勤者数が足りない日を抽出
  const reqByDow = new Map<number, number>();
  for (const r of requirements) {
    reqByDow.set(r.day_of_week, Math.max(reqByDow.get(r.day_of_week) ?? 0, r.required_staff));
  }
  const countByDate = new Map<string, number>();
  for (const s of shifts) countByDate.set(s.work_date, (countByDate.get(s.work_date) ?? 0) + 1);
  const shortages: { date: string; label: string; have: number; need: number }[] = [];
  if (reqByDow.size > 0) {
    for (const [date, have] of countByDate) {
      const [y, m, d] = date.split("-").map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      const need = reqByDow.get(dow) ?? 0;
      if (need > 0 && have < need) {
        shortages.push({
          date,
          label: `${m}/${d}（${DAY_LABELS_JA[dow]}）`,
          have,
          need,
        });
      }
    }
    shortages.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ----- スタッフ別 勤務状況（今月）-----
  const monthlyByStaff = new Map<string, number>();
  for (const s of shifts) {
    monthlyByStaff.set(s.staff_id, (monthlyByStaff.get(s.staff_id) ?? 0) + hours(s));
  }
  // weeks in this month (approx): 勤務がある期間の概算で月→週上限換算
  const workRows = staff
    .filter((s) => s.role === "staff" && monthlyByStaff.has(s.id))
    .map((s) => {
      const monthH = monthlyByStaff.get(s.id) ?? 0;
      const maxMonth = (s.max_hours_per_week || 40) * 4; // 週上限 × 4週 を月の目安に
      const ratio = maxMonth > 0 ? Math.min(1, monthH / maxMonth) : 0;
      return { staff: s, monthH, maxMonth, ratio, over: monthH > maxMonth };
    })
    .sort((a, b) => b.ratio - a.ratio);

  // ----- 推定人件費・総勤務時間 -----
  const totalHours = shifts.reduce((sum, s) => sum + hours(s), 0);
  let laborCost = 0;
  let wageMissing = 0;
  for (const s of shifts) {
    const wage = staffById.get(s.staff_id)?.hourly_wage ?? null;
    if (wage == null) wageMissing++;
    else laborCost += wage * hours(s);
  }

  return (
    <>
      {/* 今日・明日の出勤者 */}
      <div className="section">
        <div className="section-head">
          <h2>今日・明日の出勤者</h2>
          <span className="eyebrow">On Duty</span>
        </div>
        <div className="section-body" style={{ paddingTop: 18 }}>
          {!hasTodayData ? (
            <p className="help" style={{ marginTop: 0 }}>
              直近の出勤予定はありません（公開中シフトの対象外の可能性があります）。
            </p>
          ) : (
            <div className="duty-grid">
              {dayBuckets.map((b, i) => (
                <div className="duty-col" key={i}>
                  <div className="duty-head">
                    <span className="en">{i === 0 ? "TODAY" : "TOMORROW"}</span>
                    <span className="soft">{b.label}</span>
                    <span className="period-count" style={{ marginLeft: "auto" }}>
                      {b.list.length}名
                    </span>
                  </div>
                  <div className="duty-people">
                    {b.list.length === 0 ? (
                      <span className="help" style={{ margin: 0 }}>
                        出勤者なし
                      </span>
                    ) : (
                      b.list.map((s) => {
                        const p = staffById.get(s.staff_id);
                        return (
                          <span className="duty-person" key={s.id}>
                            <span
                              className="dot"
                              style={{ background: p?.display_color ?? "#8e897f" }}
                            />
                            {p ? surname(p.full_name) : "?"}
                            <span className="tm en">
                              {hm(s.start_time)}–{hm(s.end_time)}
                            </span>
                          </span>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="insight-2col">
        {/* 人手不足アラート */}
        <div className="section">
          <div className="section-head">
            <h2>人手不足アラート</h2>
            <span className="eyebrow">Coverage</span>
          </div>
          <div className="section-body" style={{ paddingTop: 18 }}>
            {reqByDow.size === 0 ? (
              <p className="help" style={{ marginTop: 0 }}>
                必要人数が未設定です。
                <Link href={editHref} className="btn-link" style={{ marginLeft: 8 }}>
                  設定する →
                </Link>
              </p>
            ) : shortages.length === 0 ? (
              <p className="soft" style={{ margin: 0, fontSize: 14 }}>
                ✓ 必要人数を満たしています。
              </p>
            ) : (
              <div className="alert-list">
                {shortages.map((a) => (
                  <Link href={editHref} key={a.date} className="alert-row">
                    <span className="alert-date">{a.label}</span>
                    <span className="alert-bar">
                      <span className="have en">{a.have}</span>
                      <span className="sep">/</span>
                      <span className="need en">{a.need}名</span>
                    </span>
                    <span className="alert-tag">不足 {a.need - a.have}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* スタッフ別 勤務状況 */}
        <div className="section">
          <div className="section-head">
            <h2>スタッフ別 勤務状況</h2>
            <span className="eyebrow">Workload</span>
          </div>
          <div className="section-body" style={{ paddingTop: 18 }}>
            {workRows.length === 0 ? (
              <p className="help" style={{ marginTop: 0 }}>
                勤務データがありません。
              </p>
            ) : (
              <div className="work-list">
                {workRows.map((r) => (
                  <div className="work-row" key={r.staff.id}>
                    <span className="work-name">
                      <span className="dot" style={{ background: r.staff.display_color }} />
                      {surname(r.staff.full_name)}
                    </span>
                    <span className="work-track">
                      <span
                        className="work-fill"
                        style={{
                          width: `${Math.max(4, r.ratio * 100)}%`,
                          background: r.over ? "#94560e" : r.staff.display_color,
                        }}
                      />
                    </span>
                    <span className="work-num en">
                      {r.monthH.toFixed(0)}
                      <span className="muted">/{r.maxMonth}h</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="help">月上限の目安＝週の最大時間 × 4週。</p>
          </div>
        </div>
      </div>

      {/* 推定人件費・総勤務時間 */}
      <div className="section">
        <div className="section-head">
          <h2>今月の集計</h2>
          <span className="eyebrow">Totals</span>
        </div>
        <div className="section-body" style={{ paddingTop: 18 }}>
          <div className="totals-grid">
            <div className="total-item">
              <div className="eyebrow">Total Hours</div>
              <div className="total-num en">
                {totalHours.toFixed(0)}
                <small>時間</small>
              </div>
            </div>
            <div className="total-item">
              <div className="eyebrow">Est. Labor Cost</div>
              <div className="total-num en">
                ¥{Math.round(laborCost).toLocaleString()}
              </div>
              {wageMissing > 0 && (
                <p className="help" style={{ marginTop: 6 }}>
                  ※ 時給未設定のシフトが {wageMissing} 件あり、合計には含みません。
                </p>
              )}
            </div>
            <div className="total-item">
              <div className="eyebrow">Shifts</div>
              <div className="total-num en">
                {shifts.length}
                <small>件</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
