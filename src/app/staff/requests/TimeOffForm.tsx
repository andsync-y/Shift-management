"use client";

import { useActionState, useState } from "react";
import { submitTimeOff } from "./actions";

export default function TimeOffForm() {
  const [state, formAction, pending] = useActionState(submitTimeOff, null);
  const [allDay, setAllDay] = useState(true);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">休み希望日 *</label>
          <input name="off_date" type="date" className="input" required />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="all_day"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            終日休み
          </label>
        </div>
        {!allDay && (
          <>
            <div>
              <label className="label">開始時刻</label>
              <input name="start_time" type="time" className="input" />
            </div>
            <div>
              <label className="label">終了時刻</label>
              <input name="end_time" type="time" className="input" />
            </div>
          </>
        )}
        <div className="sm:col-span-2">
          <label className="label">理由（任意）</label>
          <input name="reason" className="input" placeholder="私用 など" />
        </div>
      </div>

      {state && (
        <p className={`text-sm ${state.ok ? "text-green-600" : "text-red-600"}`}>
          {state.message}
        </p>
      )}

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "申請中..." : "お休みを申請"}
      </button>
    </form>
  );
}
