"use client";

import { useState, useTransition } from "react";
import { setNominationCount } from "./actions";

// 月ごとの指名本数の手入力（フォーカスを外すと保存）。
export default function NominationInput({
  staffId,
  month,
  initial,
}: {
  staffId: string;
  month: string;
  initial: number;
}) {
  const [val, setVal] = useState(String(initial ?? 0));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const save = () => {
    const n = Math.max(0, parseInt(val || "0", 10) || 0);
    if (n === (initial ?? 0)) return; // 変更なしは保存しない
    start(async () => {
      const r = await setNominationCount(staffId, month, n);
      if (r.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1200);
      }
    });
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
      <input
        type="number"
        min={0}
        value={val}
        disabled={pending}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="input en"
        style={{ width: 60, textAlign: "right", padding: "4px 6px", fontSize: 12.5 }}
      />
      {saved && <span style={{ color: "#3d6b4f", fontSize: 11 }}>✓</span>}
    </span>
  );
}
