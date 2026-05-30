import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PERIOD_STATUS_LABELS_JA,
  type Profile,
  type Shift,
  type ShiftPeriod,
} from "@/lib/types";
import ShiftCalendar from "@/components/ShiftCalendar";

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
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">シフト確認</h1>
        <div className="card text-center text-gray-400">
          公開中のシフトはまだありません。
        </div>
      </div>
    );
  }

  const [{ data: shifts }, { data: staff }] = await Promise.all([
    supabase.from("shifts").select("*").eq("period_id", latest.id),
    supabase.from("profiles").select("*"),
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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">
          {latest.year}年{latest.month}月 のシフト
        </h1>
        <span className="badge bg-blue-100 text-blue-700">
          {PERIOD_STATUS_LABELS_JA[latest.status]}
        </span>
      </div>

      <div className="card">
        <p className="text-sm text-gray-500">あなたの今月の勤務</p>
        <p className="mt-1 text-2xl font-bold">
          {myShifts.length}<span className="ml-1 text-base font-normal text-gray-400">日</span>
          <span className="ml-3">{myHours.toFixed(1)}<span className="ml-1 text-base font-normal text-gray-400">時間</span></span>
        </p>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">シフト表（あなたの勤務を強調表示）</h2>
        <ShiftCalendar
          year={latest.year}
          month={latest.month}
          shifts={(shifts ?? []) as Shift[]}
          staff={(staff ?? []) as Profile[]}
          highlightStaffId={me.id}
        />
      </div>
    </div>
  );
}
