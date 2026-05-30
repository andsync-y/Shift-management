import { DAY_LABELS_JA, type Profile, type Shift } from "@/lib/types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// 月次のシフトを日付別に一覧表示する（読み取り専用）。
// highlightStaffId を渡すと、そのスタッフのシフトを強調表示する。
export default function ShiftCalendar({
  year,
  month,
  shifts,
  staff,
  highlightStaffId,
}: {
  year: number;
  month: number;
  shifts: Shift[];
  staff: Profile[];
  highlightStaffId?: string;
}) {
  const staffMap = new Map(staff.map((s) => [s.id, s]));
  const lastDay = new Date(year, month, 0).getDate();

  const byDate: Record<string, Shift[]> = {};
  for (const s of shifts) (byDate[s.work_date] ??= []).push(s);

  const days = Array.from({ length: lastDay }, (_, i) => {
    const d = i + 1;
    const date = `${year}-${pad(month)}-${pad(d)}`;
    const dow = new Date(year, month - 1, d).getDay();
    return { d, date, dow };
  });

  return (
    <div className="space-y-1">
      {days.map(({ d, date, dow }) => {
        const dayShifts = (byDate[date] ?? []).sort((a, b) =>
          a.start_time.localeCompare(b.start_time)
        );
        const isWeekend = dow === 0 || dow === 6;
        return (
          <div
            key={date}
            className={`flex gap-3 rounded-md border border-gray-100 px-3 py-2 ${
              isWeekend ? "bg-red-50/40" : "bg-white"
            }`}
          >
            <div className="w-16 shrink-0 text-sm">
              <span className="font-semibold">{d}</span>
              <span
                className={`ml-1 ${
                  dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-gray-400"
                }`}
              >
                {DAY_LABELS_JA[dow]}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dayShifts.length === 0 && (
                <span className="text-xs text-gray-300">—</span>
              )}
              {dayShifts.map((s) => {
                const p = staffMap.get(s.staff_id);
                const isMine = highlightStaffId && s.staff_id === highlightStaffId;
                return (
                  <span
                    key={s.id}
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
                      isMine ? "ring-2 ring-brand" : ""
                    }`}
                    style={{
                      backgroundColor: (p?.display_color ?? "#999") + "22",
                      color: p?.display_color ?? "#333",
                    }}
                  >
                    <span className="font-medium">{p?.full_name ?? "?"}</span>
                    <span className="text-[10px] opacity-80">
                      {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
