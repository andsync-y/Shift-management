"use client";

import { useState, useTransition } from "react";
import { setIncomeTaxOverride } from "./actions";

// 源泉所得税の月次手入力（フォーカスを外すと保存）。
// 通常は税額表（令和8年分）の自動計算値が使われる。個別事情の上書き用。
// 空欄に戻すと自動計算に復帰。
export default function TaxInput({
  staffId,
  month,
  initial, // 手入力済みの額（無ければ null＝自動計算）
  auto, // 税額表による自動計算値
}: {
  staffId: string;
  month: string;
  initial: number | null;
  auto: number;
}) {
  const [val, setVal] = useState(initial == null ? "" : String(initial));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const save = () => {
    const trimmed = val.trim();
    const n = trimmed === "" ? null : Math.max(0, parseInt(trimmed, 10) || 0);
    if (n === initial) return; // 変更なしは保存しない
    start(async () => {
      const r = await setIncomeTaxOverride(staffId, month, n);
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
        placeholder={String(auto)}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="input en"
        style={{ width: 76, textAlign: "right", padding: "4px 6px", fontSize: 12.5 }}
        title="空欄=税額表（令和8年分）で自動計算。個別事情があるときだけ手入力で上書き。"
      />
      {saved && <span style={{ color: "#3d6b4f", fontSize: 11 }}>✓</span>}
    </span>
  );
}
