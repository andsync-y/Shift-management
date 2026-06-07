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
    supabase.from("profiles").select("*").eq("role", "staff").order("full_name"),
  ]);

  const staff = (staffRaw as Profile[] | null) ?? [];
  const staffMap = new Map(staff.map((s) => [s.id, s]));
  const records = ((recordsRaw as TimeRecord[] | null) ?? []).map((r) => ({
    ...r,
    staffName: staffMap.get(r.staff_id)?.full_name ?? "?",
  }));

  // スタッフ別 集計
  type Agg = { name: string; minutes: number; wage: number | null; open: number };
  const agg = new Map<string, Agg>();
  for (const r of records) {
    const a =
      agg.get(r.staff_id) ??
      { name: staffMap.get(r.staff_id)?.full_name ?? "?", minutes: 0, wage: staffMap.get(r.staff_id)?.hourly_wage ?? null, open: 0 };
    if (r.clock_in && r.clock_out) a.minutes += minutesBetween(r.clock_in, r.clock_out);
    else if (r.clock_in && !r.clock_out) a.open += 1;
    agg.set(r.staff_id, a);
  }
  const rows = [...agg.values()].sort((a, b) => b.minutes - a.minutes);
  const totalPay = rows.reduce((s, r) => s + (r.wage ? (r.minutes / 60) * r.wage : 0), 0);

  return (
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Owner Console</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>Time Cards</h1>
          <p className="sub">勤怠・給与集計 — {y}年{m}月</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a className="btn-outline" href={`/admin/timecards?month=${prev}`}>← 前月</a>
          <a className="btn-outline" href={`/admin/timecards?month=${next}`}>翌月 →</a>
        </div>
      </div>

      {/* 給与集計 */}
      <div className="section">
        <div className="section-head">
          <h2>スタッフ別 集計</h2>
          <span className="eyebrow">Payroll</span>
        </div>
        <div className="section-body">
          <p className="help" style={{ marginTop: 0, marginBottom: 18 }}>
            打刻（出勤〜退勤）の合計時間と、時給からの概算給与です。休憩時間は自動控除していません（必要なら別途調整してください）。
          </p>
          {rows.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>この月の記録はありません。</p>
          ) : (
            <>
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>スタッフ</th>
                    <th>勤務時間</th>
                    <th>時給</th>
                    <th>概算給与</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name}>
                      <td>
                        {r.name}
                        {r.open > 0 && <span className="mk early" style={{ marginLeft: 8, fontSize: 10 }}>打刻中{r.open}</span>}
                      </td>
                      <td className="mono">{Math.floor(r.minutes / 60)}時間{r.minutes % 60}分</td>
                      <td className="mono soft">{r.wage ? `¥${r.wage.toLocaleString()}` : "—"}</td>
                      <td className="mono">{r.wage ? `¥${Math.round((r.minutes / 60) * r.wage).toLocaleString()}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ marginTop: 16, textAlign: "right" }}>
                <span className="muted" style={{ fontSize: 13 }}>概算合計 </span>
                <span className="en" style={{ fontSize: 22 }}>¥{Math.round(totalPay).toLocaleString()}</span>
              </p>
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
        <div className="section-body">
          <TimeCardManager
            staff={staff.map((s) => ({ id: s.id, full_name: s.full_name }))}
            records={records}
          />
        </div>
      </div>
    </div>
  );
}
