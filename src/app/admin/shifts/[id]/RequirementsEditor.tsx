"use client";

import { useState, useTransition } from "react";
import {
  addRequirement,
  deleteRequirement,
} from "../actions";
import { DAY_LABELS_JA, type ShiftRequirement } from "@/lib/types";

export default function RequirementsEditor({
  periodId,
  initial,
}: {
  periodId: string;
  initial: ShiftRequirement[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleAdd(formData: FormData) {
    const res = await addRequirement(periodId, formData);
    setMessage(res.message);
  }

  const byDay: Record<number, ShiftRequirement[]> = {};
  for (const r of initial) (byDay[r.day_of_week] ??= []).push(r);

  return (
    <div className="space-y-4">
      <form action={handleAdd} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">曜日</label>
          <select name="day_of_week" className="input w-24" defaultValue="1">
            {DAY_LABELS_JA.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">開始</label>
          <input name="start_time" type="time" className="input w-32" defaultValue="10:00" required />
        </div>
        <div>
          <label className="label">終了</label>
          <input name="end_time" type="time" className="input w-32" defaultValue="14:00" required />
        </div>
        <div>
          <label className="label">必要人数</label>
          <input name="required_staff" type="number" min={0} className="input w-24" defaultValue={1} required />
        </div>
        <button type="submit" className="btn-primary">追加</button>
      </form>

      {message && <p className="text-sm text-gray-600">{message}</p>}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {DAY_LABELS_JA.map((label, dow) => (
          <div key={dow} className="rounded-md border border-gray-200 p-3">
            <p className="mb-2 text-sm font-semibold text-gray-700">{label}曜日</p>
            <ul className="space-y-1">
              {(byDay[dow] ?? []).length === 0 && (
                <li className="text-xs text-gray-400">未設定</li>
              )}
              {(byDay[dow] ?? [])
                .sort((a, b) => a.start_time.localeCompare(b.start_time))
                .map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}{" "}
                      <span className="font-semibold text-brand">{r.required_staff}名</span>
                    </span>
                    <button
                      onClick={() => startTransition(() => deleteRequirement(r.id, periodId))}
                      className="text-gray-400 hover:text-red-500"
                      disabled={pending}
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
