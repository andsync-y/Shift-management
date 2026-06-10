"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addShift, deleteShift, updateShift } from "../actions";
import { DAY_LABELS_JA, type Profile, type Shift } from "@/lib/types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function ShiftEditor({
  periodId,
  year,
  month,
  shifts,
  staff,
}: {
  periodId: string;
  year: number;
  month: number;
  shifts: Shift[];
  staff: Profile[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const activeStaff = staff.filter((s) => s.is_active);
  const staffMap = new Map(staff.map((s) => [s.id, s]));
  const lastDay = new Date(year, month, 0).getDate();

  async function handleAdd(formData: FormData) {
    const res = await addShift(periodId, formData);
    setMessage(res.message);
    if (res.ok) router.refresh();
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteShift(id, periodId);
      router.refresh();
    });
  }

  function handleUpdate(id: string, start: string, end: string) {
    startTransition(async () => {
      const res = await updateShift(id, periodId, start, end);
      setMessage(res.message);
      setEditing(null);
      router.refresh();
    });
  }

  const byDate: Record<string, Shift[]> = {};
  for (const s of shifts) (byDate[s.work_date] ??= []).push(s);

  return (
    <div className="space-y-4">
      <form action={handleAdd} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">スタッフ</label>
          <select name="staff_id" className="input w-40" required defaultValue="">
            <option value="" disabled>
              選択
            </option>
            {activeStaff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">日</label>
          <select name="work_date" className="input w-28" required defaultValue="">
            <option value="" disabled>
              選択
            </option>
            {Array.from({ length: lastDay }, (_, i) => {
              const d = i + 1;
              const date = `${year}-${pad(month)}-${pad(d)}`;
              const dow = new Date(year, month - 1, d).getDay();
              return (
                <option key={date} value={date}>
                  {month}/{d}({DAY_LABELS_JA[dow]})
                </option>
              );
            })}
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
        <button type="submit" className="btn-primary" disabled={pending}>
          シフトを追加
        </button>
      </form>

      {message && <p className="text-sm text-gray-600">{message}</p>}

      <div className="max-h-96 space-y-1 overflow-y-auto">
        {Object.keys(byDate)
          .sort()
          .map((date) => {
            const dow = new Date(date).getDay();
            return (
              <div key={date} className="flex gap-3 border-b border-gray-100 py-1.5 text-sm">
                <div className="w-20 shrink-0 text-gray-500">
                  {Number(date.slice(-2))}日({DAY_LABELS_JA[dow]})
                </div>
                <div className="flex flex-wrap gap-2">
                  {byDate[date]
                    .sort((a, b) => a.start_time.localeCompare(b.start_time))
                    .map((s) => {
                      const p = staffMap.get(s.staff_id);
                      const isEditing = editing === s.id;
                      return (
                        <span
                          key={s.id}
                          className={
                            "inline-flex items-center gap-1 rounded px-2 py-0.5" +
                            (isEditing ? " w-full flex-wrap" : "")
                          }
                          style={{
                            backgroundColor: (p?.display_color ?? "#999") + "22",
                            color: p?.display_color ?? "#333",
                          }}
                        >
                          <span className="whitespace-nowrap font-medium">{p?.full_name ?? "?"}</span>
                          {isEditing ? (
                            <EditTimes
                              start={s.start_time.slice(0, 5)}
                              end={s.end_time.slice(0, 5)}
                              onSave={(st, en) => handleUpdate(s.id, st, en)}
                              onCancel={() => setEditing(null)}
                            />
                          ) : (
                            <>
                              <button
                                onClick={() => setEditing(s.id)}
                                className="text-[10px] underline opacity-80"
                              >
                                {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                              </button>
                              {!s.ai_generated && (
                                <span className="text-[9px] opacity-60">✎</span>
                              )}
                              <button
                                onClick={() => handleDelete(s.id)}
                                className="ml-0.5 opacity-70 hover:opacity-100"
                                aria-label="削除"
                                disabled={pending}
                              >
                                ×
                              </button>
                            </>
                          )}
                        </span>
                      );
                    })}
                </div>
              </div>
            );
          })}
        {shifts.length === 0 && (
          <p className="py-2 text-sm text-gray-400">シフトがありません。</p>
        )}
      </div>
    </div>
  );
}

function EditTimes({
  start,
  end,
  onSave,
  onCancel,
}: {
  start: string;
  end: string;
  onSave: (start: string, end: string) => void;
  onCancel: () => void;
}) {
  const [s, setS] = useState(start);
  const [e, setE] = useState(end);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input type="time" value={s} onChange={(ev) => setS(ev.target.value)} className="w-[88px] rounded border bg-white px-1 py-0.5 text-xs text-gray-800" />
      <input type="time" value={e} onChange={(ev) => setE(ev.target.value)} className="w-[88px] rounded border bg-white px-1 py-0.5 text-xs text-gray-800" />
      <button onClick={() => onSave(s, e)} className="whitespace-nowrap text-xs font-bold text-green-700">
        保存
      </button>
      <button onClick={onCancel} className="whitespace-nowrap text-xs text-gray-500">
        取消
      </button>
    </span>
  );
}
