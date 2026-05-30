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
    <div>
      <form action={handleAdd} className="add-row" style={{ marginTop: 22 }}>
        <div className="field">
          <label>
            Day <span className="jp-label">／ 曜日</span>
          </label>
          <select name="day_of_week" className="select" style={{ width: 110 }} defaultValue="1">
            {DAY_LABELS_JA.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>
            Start <span className="jp-label">／ 開始</span>
          </label>
          <input
            name="start_time"
            type="time"
            className="input"
            style={{ width: 130 }}
            defaultValue="10:00"
            required
          />
        </div>
        <div className="field">
          <label>
            End <span className="jp-label">／ 終了</span>
          </label>
          <input
            name="end_time"
            type="time"
            className="input"
            style={{ width: 130 }}
            defaultValue="19:00"
            required
          />
        </div>
        <div className="field grow">
          <label>
            Label <span className="jp-label">／ 区分（任意）</span>
          </label>
          <input name="shift_type" className="input" placeholder="早番 など" />
        </div>
        <button type="submit" className="btn-fill" style={{ padding: "13px 22px" }} disabled={pending}>
          追加
        </button>
      </form>

      {message && (
        <p className="help" style={{ marginTop: 12 }}>
          {message}
        </p>
      )}

      <div className="day-grid">
        {DAY_LABELS_JA.map((label, dow) => {
          const slots = (byDay[dow] ?? []).sort((a, b) =>
            a.start_time.localeCompare(b.start_time)
          );
          return (
            <div className="day-card" key={dow}>
              <div className="dh">{label}曜日</div>
              {slots.length === 0 ? (
                <div className="empty">未登録</div>
              ) : (
                slots.map((f) => (
                  <div className="slot" key={f.id}>
                    <span className="tm">
                      {f.start_time.slice(0, 5)}–{f.end_time.slice(0, 5)}
                    </span>
                    {f.shift_type && (
                      <span className="tag" style={{ marginLeft: 2 }}>
                        {f.shift_type}
                      </span>
                    )}
                    <button
                      className="x"
                      aria-label="削除"
                      onClick={() => startTransition(() => deleteFixedShift(f.id, staffId))}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
