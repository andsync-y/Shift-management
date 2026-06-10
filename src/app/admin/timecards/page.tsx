import { createClient } from "@/lib/supabase/server";
import type { Profile, TimeRecord } from "@/lib/types";
import TimeCardManager from "./TimeCardManager";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function jstYearMonth(): string {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}`;
}
function minutesBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
}

export default async function TimeCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : jstYearMonth();
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${pad(m)}-01`;
  const end = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;

  const supabase = await createClient();
  const [{ data: recordsRaw }, { data: staffRaw }] = await Promise.all([
    supabase
      .from("time_records")
      .select("*")
      .gte("work_date", start)
      .lte("work_date", end)
      .order("clock_in", { ascending: false }),
    supabase.from("profiles").select("*").order("full_name"),
  ]);

  const staff = (staffRaw as Profile[] | null) ?? [];
  const staffMap = new Map(staff.map((s) => [s.id, s]));
  const records = ((recordsRaw as TimeRecord[] | null) ?? []).map((r) => ({
    ...r,
    staffName: staffMap.get(r.staff_id)?.full_name ?? "?",
  }));

  // スタッフ別 集計
  type Agg = { name: string; color: string; minutes: number; wage: number | null; open: number };
  const agg = new Map<string, Agg>();
  for (const r of records) {
    const p = staffMap.get(r.staff_id);
    const a =
      agg.get(r.staff_id) ??
      { name: p?.full_name ?? "?", color: p?.display_color ?? "var(--ink-3)", minutes: 0, wage: p?.hourly_wage ?? null, open: 0 };
    if (r.clock_in && r.clock_out) a.minutes += minutesBetween(r.clock_in, r.clock_out);
    else if (r.clock_in && !r.clock_out) a.open += 1;
    agg.set(r.staff_id, a);
  }
  const rows = [...agg.values()].sort((a, b) => b.minutes - a.minutes);
  const totalPay = rows.reduce((s, r) => s + (r.wage ? (r.minutes / 60) * r.wage : 0), 0);

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Owner Console</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>Time Cards</h1>
          <p className="sub">勤怠・給与集計 — {y}年{m}月</p>
        </div>
        <div className="month-nav">
          <a className="btn-outline" href={`/admin/timecards?month=${prev}`}>← 前月</a>
          <form method="get" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="month" name="month" defaultValue={month} className="input en" style={{ width: 160 }} />
            <button type="submit" className="btn-outline">表示</button>
          </form>
          <a className="btn-outline" href={`/admin/timecards?month=${next}`}>翌月 →</a>
        </div>
      </div>

      <div className="tc-grid">
      {/* 給与集計 */}
      <div className="section" style={{ alignSelf: "start" }}>
        <div className="section-head">
          <h2>スタッフ別 集計</h2>
          <span className="eyebrow">Payroll</span>
        </div>
        <div className="section-body" style={{ paddingTop: 22 }}>
          <p className="help" style={{ marginTop: 0, marginBottom: 20 }}>
            打刻（出勤〜退勤）の合計時間と、時給からの概算給与です。休憩時間は自動控除していません。
          </p>
          {rows.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>この月の記録はありません。</p>
          ) : (
            <>
              <table className="staff-table pay-table">
                <thead>
                  <tr>
                    <th>スタッフ</th>
                    <th style={{ textAlign: "right" }}>勤務時間</th>
                    <th style={{ textAlign: "right" }}>時給</th>
                    <th style={{ textAlign: "right" }}>概算給与</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name}>
                      <td>
                        <span className="pay-staff">
                          <span className="dot" style={{ background: r.color }} />
                          <span className="pname tc-ellip" title={r.name}>{r.name}</span>
                          {r.open > 0 && <span className="live-dot" title={`打刻中 ${r.open}件`} />}
                        </span>
                      </td>
                      <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {Math.floor(r.minutes / 60)}時間{r.minutes % 60}分
                      </td>
                      <td className="muted" style={{ textAlign: "right" }}>{r.wage ? `¥${r.wage.toLocaleString()}` : "—"}</td>
                      <td className={r.wage ? "en" : "muted"} style={{ textAlign: "right" }}>
                        {r.wage ? `¥${Math.round((r.minutes / 60) * r.wage).toLocaleString()}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="pay-total">
                <span className="muted" style={{ fontSize: 12.5 }}>概算合計</span>
                <span className="pt-amount en">¥{Math.round(totalPay).toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 打刻記録（修正・追加） */}
      <div className="section">
        <div className="section-head">
          <h2>打刻記録</h2>
          <span className="eyebrow">Records</span>
        </div>
        <div className="section-body tc-records-body">
          <TimeCardManager
            staff={staff.map((s) => ({ id: s.id, full_name: s.full_name, display_color: s.display_color }))}
            records={records}
            month={month}
          />
        </div>
      </div>
      </div>
    </div>
  );
}
