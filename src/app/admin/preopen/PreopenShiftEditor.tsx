"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PREOPEN_DAYS } from "@/lib/preopen";
import type { PreopenShift, Profile } from "@/lib/types";
import { resetPreopenShifts, savePreopenShifts, type ShiftInput } from "./actions";

type Row = { staffId: string; start: string; end: string; training: boolean };

const TIME_OPTIONS = (() => {
  const out: string[] = [];
  for (let m = 13 * 60; m <= 22 * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
})();

export default function PreopenShiftEditor({
  staff,
  shifts,
}: {
  staff: Pick<Profile, "id" | "full_name">[];
  shifts: PreopenShift[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 日付 → 行配列。DBの現在値で初期化。
  const [rowsByDate, setRowsByDate] = useState<Record<string, Row[]>>(() => {
    const init: Record<string, Row[]> = {};
    for (const day of PREOPEN_DAYS) {
      init[day.date] = shifts
        .filter((s) => s.reserve_date === day.date)
        .map((s) => ({
          staffId: s.staff_id,
          start: s.start_time.slice(0, 5),
          end: s.end_time.slice(0, 5),
          training: s.is_training,
        }));
    }
    return init;
  });

  function update(date: string, i: number, patch: Partial<Row>) {
    setRowsByDate((prev) => ({
      ...prev,
      [date]: prev[date].map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }));
  }
  function addRow(date: string) {
    setRowsByDate((prev) => ({
      ...prev,
      [date]: [...prev[date], { staffId: "", start: "13:00", end: "21:00", training: false }],
    }));
  }
  function removeRow(date: string, i: number) {
    setRowsByDate((prev) => ({ ...prev, [date]: prev[date].filter((_, idx) => idx !== i) }));
  }

  function save() {
    const payload: ShiftInput[] = [];
    for (const day of PREOPEN_DAYS) {
      for (const r of rowsByDate[day.date] ?? []) {
        payload.push({ date: day.date, staffId: r.staffId, start: r.start, end: r.end, training: r.training });
      }
    }
    startTransition(async () => {
      const res = await savePreopenShifts(payload);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });
  }

  function reset() {
    if (!confirm("現在のシフトを破棄して初期シフト（雛形）に戻しますか？")) return;
    startTransition(async () => {
      const res = await resetPreopenShifts();
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="section">
      <div className="section-head">
        <h2>シフトを編集</h2>
        <span className="eyebrow">オーナーのみ</span>
      </div>
      <div className="section-body">
        {msg && (
          <p className={"liff-msg " + (msg.ok ? "ok" : "err")} style={{ marginTop: 0 }}>
            {msg.text}
          </p>
        )}

        {PREOPEN_DAYS.map((day) => (
          <div key={day.date} style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ margin: "0 0 6px", fontWeight: 700 }}>
              {day.label}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {(rowsByDate[day.date] ?? []).map((r, i) => (
                <div key={i} className="po-edit-row">
                  <select
                    className="input"
                    value={r.staffId}
                    onChange={(e) => update(day.date, i, { staffId: e.target.value })}
                    disabled={pending}
                  >
                    <option value="">スタッフ</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input en"
                    value={r.start}
                    onChange={(e) => update(day.date, i, { start: e.target.value })}
                    disabled={pending}
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <span className="soft">–</span>
                  <select
                    className="input en"
                    value={r.end}
                    onChange={(e) => update(day.date, i, { end: e.target.value })}
                    disabled={pending}
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <label className="po-edit-train">
                    <input
                      type="checkbox"
                      checked={r.training}
                      onChange={(e) => update(day.date, i, { training: e.target.checked })}
                      disabled={pending}
                    />
                    研修のみ
                  </label>
                  <button
                    type="button"
                    className="po-edit-x"
                    onClick={() => removeRow(day.date, i)}
                    disabled={pending}
                    aria-label="この行を削除"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-link ink"
                onClick={() => addRow(day.date)}
                disabled={pending}
                style={{ justifySelf: "start", fontSize: 13 }}
              >
                ＋ スタッフを追加
              </button>
            </div>
          </div>
        ))}

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
          <button className="btn-fill" onClick={save} disabled={pending}>
            {pending ? "保存中..." : "シフトを保存"}
          </button>
          <button className="btn-link ink" onClick={reset} disabled={pending} style={{ fontSize: 13 }}>
            初期シフトに戻す
          </button>
        </div>
        <p className="help" style={{ marginBottom: 0 }}>
          「研修のみ」は施術に入らない扱い（受付数に数えません）。保存すると受付数・空き状況に即反映されます。
        </p>
      </div>
    </div>
  );
}
