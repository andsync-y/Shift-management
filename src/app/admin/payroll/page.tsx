import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile, TimeRecord } from "@/lib/types";
import { displayName } from "@/lib/display-name";
import { computePayroll, hhmm, type PayrollRecord } from "@/lib/payroll";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function jstYearMonth(): string {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}`;
}
const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : jstYearMonth();
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${pad(m)}-01`;
  const end = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;

  const supabase = await createClient();
  const [{ data: recordsRaw }, { data: staffRaw }] = await Promise.all([
    supabase.from("time_records").select("*").gte("work_date", start).lte("work_date", end),
    supabase.from("profiles").select("*").eq("role", "staff").eq("is_active", true).order("full_name"),
  ]);

  const staff = (staffRaw as Profile[] | null) ?? [];
  const records = (recordsRaw as TimeRecord[] | null) ?? [];
  const byStaff = new Map<string, PayrollRecord[]>();
  for (const r of records) {
    if (!byStaff.has(r.staff_id)) byStaff.set(r.staff_id, []);
    byStaff.get(r.staff_id)!.push(r);
  }

  const rows = staff
    .map((s) => ({
      staff: s,
      pay: computePayroll(byStaff.get(s.id) ?? [], s.hourly_wage, s.commute_allowance ?? 0),
    }))
    .filter((r) => r.pay.workedMin > 0 || r.pay.openCount > 0);

  const totalGross = rows.reduce((sum, r) => sum + r.pay.gross, 0);

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Owner Console</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>
            Payroll
          </h1>
          <p className="sub">
            給与計算（実打刻ベース）— {y}年{m}月
          </p>
        </div>
        <div className="month-nav">
          <a className="btn-outline" href={`/admin/payroll?month=${prev}`}>
            ← 前月
          </a>
          <form method="get" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="month" name="month" defaultValue={month} className="input en" style={{ width: 160 }} />
            <button type="submit" className="btn-outline">
              表示
            </button>
          </form>
          <a className="btn-outline" href={`/admin/payroll?month=${next}`}>
            翌月 →
          </a>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>スタッフ別 給与</h2>
          <span className="eyebrow">合計 {yen(totalGross)}</span>
        </div>
        <div className="section-body" style={{ overflowX: "auto", paddingTop: 10 }}>
          {rows.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>
              この月の打刻記録はありません。
            </p>
          ) : (
            <table className="staff-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>スタッフ</th>
                  <th style={{ textAlign: "right" }}>実働</th>
                  <th style={{ textAlign: "right" }}>うち残業</th>
                  <th style={{ textAlign: "right" }}>うち深夜</th>
                  <th style={{ textAlign: "right" }}>時給</th>
                  <th style={{ textAlign: "right" }}>基本</th>
                  <th style={{ textAlign: "right" }}>残業割増</th>
                  <th style={{ textAlign: "right" }}>深夜割増</th>
                  <th style={{ textAlign: "right" }}>交通費</th>
                  <th style={{ textAlign: "right" }}>総支給</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ staff: s, pay }) => (
                  <tr key={s.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className="dot" style={{ background: s.display_color, marginRight: 6 }} />
                      {displayName(s)}
                      {pay.openCount > 0 && (
                        <span className="mk late" style={{ marginLeft: 6 }}>
                          打刻中{pay.openCount}
                        </span>
                      )}
                    </td>
                    <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{hhmm(pay.workedMin)}</td>
                    <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{hhmm(pay.overtimeMin)}</td>
                    <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{hhmm(pay.nightMin)}</td>
                    <td className="muted" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {(() => {
                        const ws = [...new Set(pay.days.map((d) => d.wage))].filter((w) => w > 0);
                        return ws.length === 0 ? "—" : ws.map((w) => yen(w)).join(" / ");
                      })()}
                    </td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(pay.basePay)}</td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(pay.overtimePay)}</td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(pay.nightPay)}</td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(pay.commute)}</td>
                    <td className="en" style={{ textAlign: "right", fontWeight: 700 }}>{yen(pay.gross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="help" style={{ marginBottom: 0 }}>
            休憩自動控除（実働8h超→60分／6h超→45分）・残業1.25倍（1日8h超）・深夜22:00〜5:00を25%加算で計算。
            時給は期間別（6/8〜6/19は¥1,060／6/20〜7/31は¥1,600・全員一律）、範囲外は各自の時給。
            交通費は「スタッフ管理」で設定。総支給（額面）まで算出（源泉・社保は未控除）。
          </p>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>日別の明細</h2>
            <span className="eyebrow">名前をタップで展開</span>
          </div>
          <div className="section-body">
            {rows.map(({ staff: s, pay }) => (
              <details key={s.id} className="pay-detail">
                <summary>
                  <span className="dot" style={{ background: s.display_color, marginRight: 6 }} />
                  {displayName(s)}
                  <span className="soft" style={{ marginLeft: 8, fontSize: 12 }}>
                    実働 {hhmm(pay.workedMin)} ・ {yen(pay.gross)}
                  </span>
                </summary>
                <table className="staff-table" style={{ fontSize: 12.5, marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>日付</th>
                      <th>出退勤</th>
                      <th style={{ textAlign: "right" }}>実働</th>
                      <th style={{ textAlign: "right" }}>休憩</th>
                      <th style={{ textAlign: "right" }}>残業</th>
                      <th style={{ textAlign: "right" }}>深夜</th>
                      <th style={{ textAlign: "right" }}>時給</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pay.days.map((d) => (
                      <tr key={d.date}>
                        <td className="en" style={{ whiteSpace: "nowrap" }}>{d.date.slice(5).replace("-", "/")}</td>
                        <td className="en" style={{ whiteSpace: "nowrap" }}>
                          {d.inOut.map((io, i) => (
                            <span key={i}>
                              {i > 0 && ", "}
                              {io.in}–{io.out}
                            </span>
                          ))}
                        </td>
                        <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{hhmm(d.workedMin)}</td>
                        <td className="en" style={{ textAlign: "right" }}>{d.breakMin}分</td>
                        <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{hhmm(d.overtimeMin)}</td>
                        <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{hhmm(d.nightMin)}</td>
                        <td className="en" style={{ textAlign: "right" }}>{d.wage ? yen(d.wage) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
