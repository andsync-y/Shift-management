"use client";

import { useState, useTransition } from "react";
import {
  addFixedShift,
  deleteFixedShift,
} from "@/app/admin/staff/[id]/fixed-shift-actions";
import { DAY_LABELS_JA, type FixedShift } from "@/lib/types";

export default function FixedShiftEditor({
  staffId,
  initial,
}: {
  staffId: string;
  initial: FixedShift[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleAdd(formData: FormData) {
    const res = await addFixedShift(staffId, formData);
    setMessage(res.message);
  }

  const byDay: Record<number, FixedShift[]> = {};
  for (const f of initial) (byDay[f.day_of_week] ??= []).push(f);

  return (
    <div className="space-y-4">
      <form action={handleAdd} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">曜日</label>
          <select name="day_of_week" className="input w-24" defaultValue="1">
            {DAY_LABELS_JA.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">開始</label>
          <input name="start_time" type="time" className="input w-32" defaultValue="10:00" required />
        </div>
        <div>
          <label className="label">終了</label>
          <input name="end_time" type="time" className="input w-32" defaultValue="19:00" required />
        </div>
        <div>
          <label className="label">区分(任意)</label>
          <input name="shift_type" className="input w-28" placeholder="早番 など" />
        </div>
        <button type="submit" className="btn-primary" disabled={pending}>
          追加
        </button>
      </form>

      {message && <p className="text-sm text-gray-600">{message}</p>}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {DAY_LABELS_JA.map((label, dow) => (
          <div key={dow} className="rounded-md border border-gray-200 p-3">
            <p className="mb-2 text-sm font-semibold text-gray-700">{label}曜日</p>
            <ul className="space-y-1">
              {(byDay[dow] ?? []).length === 0 && (
                <li className="text-xs text-gray-400">未登録</li>
              )}
              {(byDay[dow] ?? [])
                .sort((a, b) => a.start_time.localeCompare(b.start_time))
                .map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      {f.start_time.slice(0, 5)}–{f.end_time.slice(0, 5)}
                      {f.shift_type && (
                        <span className="ml-1 text-gray-400">({f.shift_type})</span>
                      )}
                    </span>
                    <button
                      onClick={() =>
                        startTransition(() => deleteFixedShift(f.id, staffId))
                      }
                      className="text-gray-400 hover:text-red-500"
                      aria-label="削除"
                    >
                      ×
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
