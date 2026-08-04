"use client";

import { useState, useTransition } from "react";
import { testLinePush } from "./actions";

// LINE通知の疎通テスト（オーナー自身へ送信して結果を表示）。
export default function LineTestButton() {
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
            const r = await testLinePush();
            setMsg({ ok: r.ok, text: r.message });
          })
        }
      >
        {pending ? "送信中…" : "LINE通知をテスト"}
      </button>
      {msg && (
        <span className="help" style={{ margin: 0, color: msg.ok ? "#3d6b4f" : "#9a3a30", whiteSpace: "pre-wrap" }}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
