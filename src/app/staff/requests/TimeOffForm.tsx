"use client";

import { useActionState, useState } from "react";
import { submitTimeOff } from "./actions";

export default function TimeOffForm() {
  const [state, formAction, pending] = useActionState(submitTimeOff, null);
  const [reqType, setReqType] = useState<"off" | "time_change">("off");
  const [allDay, setAllDay] = useState(true);
  const [dates, setDates] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  const isTimeChange = reqType === "time_change";
  const showTimes = isTimeChange || !allDay;

  function addDate() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft)) return;
    if (!dates.includes(draft)) {
      setDates((prev) => [...prev, draft].sort());
    }
    setDraft("");
  }
  function removeDate(d: string) {
    setDates((prev) => prev.filter((x) => x !== d));
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="off_dates" value={dates.join(",")} />
      <input type="hidden" name="request_type" value={reqType} />

      <div className="seg" role="tablist" style={{ display: "inline-flex" }}>
        <button
          type="button"
          className={reqType === "off" ? "on" : ""}
          onClick={() => setReqType("off")}
        >
          欠勤（休み）
        </button>
        <button
          type="button"
          className={reqType === "time_change" ? "on" : ""}
          onClick={() => setReqType("time_change")}
        >
          時間変更
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">
            {isTimeChange ? "対象日 *（複数追加できます）" : "休み希望日 *（複数追加できます）"}
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="date"
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={addDate}
              style={{ whiteSpace: "nowrap" }}
            >
              追加
            </button>
          </div>
        </div>

        {!isTimeChange && (
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
        )}

        {showTimes && (
          <>
            <div>
              <label className="label">{isTimeChange ? "希望開始時刻 *" : "開始時刻"}</label>
              <input name="start_time" type="time" className="input" defaultValue="10:00" />
            </div>
            <div>
              <label className="label">{isTimeChange ? "希望終了時刻 *" : "終了時刻"}</label>
              <input name="end_time" type="time" className="input" defaultValue="19:00" />
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <label className="label">理由（任意）</label>
          <input
            name="reason"
            className="input"
            placeholder={isTimeChange ? "通院のため など" : "私用 など"}
          />
        </div>
      </div>

      {isTimeChange && (
        <p className="help" style={{ marginTop: 0 }}>
          ※ 時間変更は「希望する新しい勤務時間」を入力してください。承認されるとカレンダーに変更希望として表示されます。
        </p>
      )}

      {/* 選択済みの日付チップ */}
      {dates.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {dates.map((d) => {
            const [, m, day] = d.split("-");
            return (
              <span
                key={d}
                className="tag accent"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {Number(m)}/{Number(day)}
                <button
                  type="button"
                  onClick={() => removeDate(d)}
                  aria-label="削除"
                  style={{
                    background: "none",
                    border: 0,
                    cursor: "pointer",
                    color: "inherit",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {state && (
        <p className={`text-sm ${state.ok ? "text-green-600" : "text-red-600"}`}>
          {state.message}
        </p>
      )}

      <button type="submit" className="btn-primary" disabled={pending || dates.length === 0}>
        {pending
          ? "申請中..."
          : `${isTimeChange ? "時間変更を申請" : "お休みを申請"}${
              dates.length > 0 ? `（${dates.length}日）` : ""
            }`}
      </button>
    </form>
  );
}
