import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PERIOD_STATUS_LABELS_JA,
  type Profile,
  type Shift,
  type ShiftPeriod,
  type TimeOffRequest,
} from "@/lib/types";
import ShiftCalendarView from "@/components/ShiftCalendarView";
import CalendarSubscribe from "@/components/CalendarSubscribe";

export default async function StaffShiftsPage() {
  const me = await requireUser();
  const supabase = await createClient();

  // 公開 or 確定済みの最新期間を表示
  const { data: periods } = await supabase
    .from("shift_periods")
    .select("*")
    .in("status", ["published", "confirmed"])
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  const latest = (periods as ShiftPeriod[] | null)?.[0];

  if (!latest) {
    return (
      <div className="page">
        <div className="page-head">
          <div className="masthead">
            <div className="eyebrow accent">Staff</div>
            <h1 className="ttl en">My Shifts</h1>
            <p className="sub">シフト確認</p>
          </div>
        </div>
        <div className="section">
          <div className="section-body">
            <p className="help" style={{ marginTop: 0 }}>
              公開中のシフトはまだありません。
            </p>
          </div>
        </div>
      </div>
    );
  }

  const monthStart = `${latest.year}-${String(latest.month).padStart(2, "0")}-01`;
  const monthEnd = `${latest.year}-${String(latest.month).padStart(2, "0")}-31`;
  const [{ data: shifts }, { data: staff }, { data: timeOff }] = await Promise.all([
    supabase.from("shifts").select("*").eq("period_id", latest.id),
    supabase.from("profiles").select("*"),
    supabase
      .from("time_off_requests")
      .select("*")
      .eq("status", "approved")
      .gte("off_date", monthStart)
      .lte("off_date", monthEnd),
  ]);

  const myShifts = (shifts as Shift[] | null)?.filter((s) => s.staff_id === me.id) ?? [];
  const myHours = myShifts.reduce((sum, s) => {
    const dur =
      (Number(s.end_time.slice(0, 2)) * 60 + Number(s.end_time.slice(3, 5)) -
        Number(s.start_time.slice(0, 2)) * 60 - Number(s.start_time.slice(3, 5))) /
      60;
    return sum + dur;
  }, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Staff</div>
          <h1 className="ttl en">My Shifts</h1>
          <p className="sub">
            シフト確認 — {latest.year}年{latest.month}月（
            {PERIOD_STATUS_LABELS_JA[latest.status]}）
          </p>
          <CalendarSubscribe token={me.calendar_token} />
        </div>
      </div>

      <div className="summary-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
        <div className="stat">
          <div className="eyebrow">Work Days</div>
          <div className="big en">
            {myShifts.length}
            <small>日</small>
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">Total Hours</div>
          <div className="big en">
            {myHours.toFixed(1)}
            <small>時間</small>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>シフト表</h2>
          <span className="eyebrow">あなたの勤務を強調</span>
        </div>
        <div className="section-body">
          <ShiftCalendarView
            year={latest.year}
            month={latest.month}
            shifts={(shifts ?? []) as Shift[]}
            staff={(staff ?? []) as Profile[]}
            timeOff={(timeOff ?? []) as TimeOffRequest[]}
            highlightStaffId={me.id}
          />
        </div>
      </div>
    </div>
  );
}
