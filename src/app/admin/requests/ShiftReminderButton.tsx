"use client";

import { useState, useTransition } from "react";
import { sendTomorrowShiftReminder } from "./actions";

// 「明日のシフト」連絡を今すぐ手動送信する（定時送信が上限等で送れなかった時の再送用）。
export default function ShiftReminderButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn-outline"
        style={{ fontSize: 12, padding: "6px 12px" }}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await sendTomorrowShiftReminder();
            setMsg({ ok: r.ok, text: r.message });
          })
        }
      >
        {pending ? "送信中…" : "明日のシフトを今すぐ送信"}
      </button>
      {msg && (
        <span className="help" style={{ margin: 0, color: msg.ok ? "#3d6b4f" : "#9a3a30", whiteSpace: "pre-wrap" }}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
