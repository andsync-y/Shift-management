import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DAY_LABELS_JA, type Profile, type Shift, type ShiftPeriod, type TimeOffRequest } from "@/lib/types";
import { displayName } from "@/lib/display-name";
import PrintControls from "./PrintControls";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(s: string, n: number) {
  const [y, m, d] = s.split("-").map(Number);
  return ymd(new Date(y, m - 1, d + n));
}

export default async function ShiftPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; start?: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const view = sp.view === "week" ? "week" : "month";
  const supabase = await createClient();

  const { data: periodRaw } = await supabase.from("shift_periods").select("*").eq("id", id).single();
  if (!periodRaw) notFound();
  const period = periodRaw as ShiftPeriod;

  const monthStart = `${period.year}-${pad(period.month)}-01`;
  const lastDay = new Date(period.year, period.month, 0).getDate();
  const monthEnd = `${period.year}-${pad(period.month)}-${pad(lastDay)}`;

  const [{ data: shiftsRaw }, { data: staffRaw }, { data: timeOffRaw }] = await Promise.all([
    supabase.from("shifts").select("*").eq("period_id", id),
    supabase.from("profiles").select("*").eq("role", "staff").eq("is_active", true).order("full_name"),
    supabase
      .from("time_off_requests")
      .select("*")
      .eq("status", "approved")
      .gte("off_date", monthStart)
      .lte("off_date", monthEnd),
  ]);
  const shifts = (shiftsRaw ?? []) as Shift[];
  const staff = (staffRaw ?? []) as Profile[];
  const timeOff = (timeOffRaw ?? []) as TimeOffRequest[];

  // 対象の日付列
  const days: string[] = [];
  if (view === "month") {
    for (let d = 1; d <= lastDay; d++) days.push(`${period.year}-${pad(period.month)}-${pad(d)}`);
  } else {
    // week: start は月内の日付。未指定なら月初を含む週の月曜始まり…ではなく、シンプルに指定日から7日。
    let start = /^\d{4}-\d{2}-\d{2}$/.test(sp.start ?? "") ? sp.start! : monthStart;
    if (start < monthStart) start = monthStart;
    for (let i = 0; i < 7; i++) days.push(addDays(start, i));
  }

  // (staff_id, date) → 勤務時間 / 休み
  const shiftByKey = new Map<string, Shift[]>();
  for (const s of shifts) {
    const k = `${s.staff_id}|${s.work_date}`;
    (shiftByKey.get(k) ?? shiftByKey.set(k, []).get(k)!).push(s);
  }
  const offByKey = new Map<string, boolean>();
  for (const t of timeOff) {
    if (t.request_type === "off" && !t.start_time && !t.end_time) offByKey.set(`${t.staff_id}|${t.off_date}`, true);
  }

  function cell(staffId: string, date: string): string {
    const ss = shiftByKey.get(`${staffId}|${date}`);
    if (ss && ss.length) {
      return ss
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
        .map((s) => `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`)
        .join(" / ");
    }
    if (offByKey.get(`${staffId}|${date}`)) return "休";
    return "";
  }

  const weekday = (date: string) => DAY_LABELS_JA[new Date(date + "T00:00:00").getDay()];
  const dnum = (date: string) => Number(date.slice(8, 10));
  const title =
    view === "month"
      ? `${period.year}年${period.month}月 シフト表`
      : `${period.year}年${period.month}月 シフト表（${dnum(days[0])}日〜${dnum(days[days.length - 1])}日）`;

  return (
    <div className="print-root">
      <PrintControls periodId={id} view={view} start={days[0]} monthStart={monthStart} monthEnd={monthEnd} />

      <div className={"print-sheet " + (view === "month" ? "landscape" : "")}>
        <div className="print-head">
          <h1>{title}</h1>
          <div className="print-store">全力ストレッチ岐阜長良店</div>
        </div>
        <table className="print-table">
          <thead>
            <tr>
              <th className="pt-name">スタッフ</th>
              {days.map((d) => {
                const w = weekday(d);
                const cls = w === "日" ? "sun" : w === "土" ? "sat" : "";
                return (
                  <th key={d} className={cls}>
                    {dnum(d)}
                    <span className="pt-w">{w}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <th className="pt-name">{displayName(s)}</th>
                {days.map((d) => {
                  const v = cell(s.id, d);
                  const w = weekday(d);
                  const cls = (w === "日" ? "sun" : w === "土" ? "sat" : "") + (v === "休" ? " off" : "");
                  return (
                    <td key={d} className={cls}>
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
