"use client";

import { useState, useTransition } from "react";
import { applyFcNominations } from "./actions";

// FCの当月指名数を一括取込んで給与を確定（再計算）するボタン。
export default function FinalizeButton({ month }: { month: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn-fill"
        style={{ fontSize: 12.5, padding: "7px 14px" }}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await applyFcNominations(month);
            setMsg({ ok: r.ok, text: r.message });
          })
        }
      >
        {pending ? "取込中…" : "FC指名数を取込んで給与確定"}
      </button>
      {msg && (
        <span className="help" style={{ margin: 0, color: msg.ok ? "#3d6b4f" : "#9a3a30" }}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
