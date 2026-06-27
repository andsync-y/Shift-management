import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile, TimeRecord } from "@/lib/types";
import { displayName } from "@/lib/display-name";
import { computePayroll, hhmm, type PayrollRecord } from "@/lib/payroll";
import NominationInput from "./NominationInput";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function jstYearMonth(): string {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}`;
}
const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const weeklyHours = (min: number) => (min / 60).toFixed(1);

interface ShahoJudge {
  hours: number; // 判定に使った週時間
  usingContract: boolean; // true=所定労働時間 / false=実績週平均で代用
  isInsured: boolean; // 加入対象か
  label: string;
  cls: string; // バッジ用クラス（late=該当）
}

// 社会保険の加入判定（目安）。週30時間以上で加入対象。
// 所定労働時間があればそれを、無ければ実績週平均を使う。
function shahoJudge(contractedHrs: number | null, actualAvgMin: number): ShahoJudge {
  const usingContract = contractedHrs != null && contractedHrs > 0;
  const hours = usingContract ? contractedHrs! : actualAvgMin / 60;
  if (hours >= 30) return { hours, usingContract, isInsured: true, label: "加入対象", cls: "late" };
  return { hours, usingContract, isInsured: false, label: "対象外", cls: "" };
}

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
  const [{ data: recordsRaw }, { data: staffRaw }, { data: nomRaw }] = await Promise.all([
    supabase.from("time_records").select("*").gte("work_date", start).lte("work_date", end),
    supabase.from("profiles").select("*").eq("role", "staff").eq("is_active", true).order("full_name"),
    supabase.from("nomination_counts").select("staff_id, count").eq("month", month),
  ]);

  const staff = (staffRaw as Profile[] | null) ?? [];
  const records = (recordsRaw as TimeRecord[] | null) ?? [];
  const nomCounts = new Map(
    ((nomRaw as { staff_id: string; count: number }[] | null) ?? []).map((r) => [r.staff_id, r.count])
  );
  const byStaff = new Map<string, PayrollRecord[]>();
  for (const r of records) {
    if (!byStaff.has(r.staff_id)) byStaff.set(r.staff_id, []);
    byStaff.get(r.staff_id)!.push(r);
  }

  const rows = staff
    .map((s) => {
      const pay = computePayroll(byStaff.get(s.id) ?? [], s.hourly_wage, s.commute_allowance ?? 0);
      const rate = s.nomination_back_rate ?? 0;
      const count = nomCounts.get(s.id) ?? 0;
      const nominationBack = rate * count;
      return { staff: s, pay, rate, count, nominationBack, grossTotal: pay.gross + nominationBack };
    })
    .filter((r) => r.pay.workedMin > 0 || r.pay.openCount > 0 || r.count > 0);

  const totalGross = rows.reduce((sum, r) => sum + r.grossTotal, 0);

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
                  <th style={{ textAlign: "right" }}>拘束</th>
                  <th style={{ textAlign: "right" }}>実働</th>
                  <th style={{ textAlign: "right" }}>週平均</th>
                  <th style={{ textAlign: "right" }}>うち残業</th>
                  <th style={{ textAlign: "right" }}>うち深夜</th>
                  <th style={{ textAlign: "right" }}>時給</th>
                  <th style={{ textAlign: "right" }}>基本</th>
                  <th style={{ textAlign: "right" }}>残業割増</th>
                  <th style={{ textAlign: "right" }}>深夜割増</th>
                  <th style={{ textAlign: "right" }}>交通費</th>
                  <th style={{ textAlign: "right" }}>指名本数</th>
                  <th style={{ textAlign: "right" }}>指名バック</th>
                  <th style={{ textAlign: "right" }}>総支給</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ staff: s, pay, count, nominationBack, grossTotal }) => (
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
                    <td className="en muted" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{hhmm(pay.clockedMin)}</td>
                    <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{hhmm(pay.workedMin)}</td>
                    <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {weeklyHours(pay.avgWeeklyMin)}h
                      {(() => {
                        const j = shahoJudge(s.contracted_weekly_hours ?? null, pay.avgWeeklyMin);
                        return j.cls ? (
                          <span
                            className={`mk ${j.cls}`}
                            style={{ marginLeft: 6 }}
                            title={`社保: ${j.label}（${j.usingContract ? "所定" : "実績"} ${j.hours.toFixed(1)}h/週）`}
                          >
                            社保
                          </span>
                        ) : null;
                      })()}
                    </td>
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
                    <td style={{ textAlign: "right" }}>
                      <NominationInput staffId={s.id} month={month} initial={count} />
                    </td>
                    <td className="en" style={{ textAlign: "right" }}>
                      {nominationBack > 0 ? yen(nominationBack) : <span className="muted">—</span>}
                    </td>
                    <td className="en" style={{ textAlign: "right", fontWeight: 700 }}>{yen(grossTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="help" style={{ marginBottom: 0 }}>
拘束＝出勤〜退勤の合計（休憩控除前・勤怠管理と一致）／実働＝休憩控除・15分丸め後（賃金の元）。
            休憩自動控除（実働8h超→60分／6h超→45分）・実働は1日ごと15分単位で四捨五入・残業1.25倍（1日8h超）・深夜22:00〜5:00を25%加算で計算。
            時給は期間別（6/8〜6/19は¥1,060／6/20〜7/31は¥1,600・全員一律）、範囲外は各自の時給。
            交通費は「スタッフ管理」で設定。総支給（額面）まで算出（源泉・社保は未控除）。
            <strong>指名バック＝指名本数×単価</strong>を総支給に加算（本数はこの表で入力＝自動保存／単価は「スタッフ管理」で設定）。
          </p>
          <p className="help" style={{ marginTop: 6, marginBottom: 0 }}>
            <strong>週平均</strong>は月内の各週（月〜日）の実働合計の平均（実績）。社保加入の目安は下の「社会保険 加入判定」を参照。
          </p>
        </div>
      </div>

      {/* 社会保険 加入判定（所定労働時間ベース＋¥8.8万チェック） */}
      {rows.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>社会保険 加入判定</h2>
            <span className="eyebrow">目安</span>
          </div>
          <div className="section-body" style={{ overflowX: "auto", paddingTop: 10 }}>
            <table className="staff-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>スタッフ</th>
                  <th style={{ textAlign: "right" }}>週所定</th>
                  <th style={{ textAlign: "right" }}>実績週平均</th>
                  <th>判定</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ staff: s, pay }) => {
                  const j = shahoJudge(s.contracted_weekly_hours ?? null, pay.avgWeeklyMin);
                  return (
                    <tr key={s.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className="dot" style={{ background: s.display_color, marginRight: 6 }} />
                        {displayName(s)}
                      </td>
                      <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {s.contracted_weekly_hours != null ? (
                          `${s.contracted_weekly_hours.toFixed(1)}h`
                        ) : (
                          <span className="muted">未設定</span>
                        )}
                      </td>
                      <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {weeklyHours(pay.avgWeeklyMin)}h
                        {!j.usingContract && (
                          <span className="mk" style={{ marginLeft: 6 }} title="所定労働時間が未設定のため実績で代用判定">代用</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className={`mk ${j.cls}`}>{j.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="help" style={{ marginBottom: 0 }}>
              <strong>週所定</strong>＝契約上の週の所定労働時間（「スタッフ管理」で設定。未設定なら実績週平均で<span className="mk" style={{ margin: "0 3px" }}>代用</span>）。
              <span className="mk late" style={{ margin: "0 4px" }}>加入対象</span>＝週30時間以上。最終判断は社労士等にご確認ください。
            </p>
          </div>
        </div>
      )}

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
