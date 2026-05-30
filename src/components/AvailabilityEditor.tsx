"use client";

import { useState, useTransition } from "react";
import {
  addAvailability,
  deleteAvailability,
} from "@/app/admin/staff/[id]/availability-actions";
import {
  DAY_LABELS_JA,
  type AvailabilityPreference,
} from "@/lib/types";

const PREF_LABEL: Record<string, string> = {
  preferred: "希望（優先）",
  available: "勤務可",
  unavailable: "不可",
};
const PREF_STYLE: Record<string, string> = {
  preferred: "bg-brand-light text-brand",
  available: "bg-blue-50 text-blue-700",
  unavailable: "bg-gray-100 text-gray-500",
};

export default function AvailabilityEditor({
  staffId,
  initial,
}: {
  staffId: string;
  initial: AvailabilityPreference[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleAdd(formData: FormData) {
    const res = await addAvailability(staffId, formData);
    setMessage(res.message);
  }

  // 曜日ごとにグルーピング
  const byDay: Record<number, AvailabilityPreference[]> = {};
  for (const a of initial) {
    (byDay[a.day_of_week] ??= []).push(a);
  }

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
          <label className="label">区分</label>
          <select name="preference" className="input w-32" defaultValue="available">
            <option value="preferred">希望（優先）</option>
            <option value="available">勤務可</option>
            <option value="unavailable">不可</option>
          </select>
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
                .map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>
                      {a.start_time.slice(0, 5)}–{a.end_time.slice(0, 5)}{" "}
                      <span className={`badge ${PREF_STYLE[a.preference]}`}>
                        {PREF_LABEL[a.preference]}
                      </span>
                    </span>
                    <button
                      onClick={() =>
                        startTransition(() => deleteAvailability(a.id, staffId))
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
