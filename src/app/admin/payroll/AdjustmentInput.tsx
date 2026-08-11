"use client";

import { useState, useTransition } from "react";
import { setPayrollAdjustment } from "./actions";

// 月別の給与調整（フォーカスを外すと保存）。
//   金額 … プラスで支給・マイナスで控除（例: 立替精算 +2,200 / 制服代 −3,000）
//   摘要 … 給与明細に印字される
//   区分 … 課税（手当など）／非課税（立替金の精算など・課税対象から除外）
export default function AdjustmentInput({
  staffId,
  month,
  initialAmount,
  initialLabel,
  initialTaxable,
}: {
  staffId: string;
  month: string;
  initialAmount: number;
  initialLabel: string;
  initialTaxable: boolean;
}) {
  const [amount, setAmount] = useState(initialAmount === 0 ? "" : String(initialAmount));
  const [label, setLabel] = useState(initialLabel);
  const [taxable, setTaxable] = useState(initialTaxable);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const save = (nextTaxable = taxable) => {
    const n = amount.trim() === "" ? 0 : Math.round(Number(amount)) || 0;
    if (n === initialAmount && label === initialLabel && nextTaxable === initialTaxable) return;
    start(async () => {
      const r = await setPayrollAdjustment(staffId, month, n, label, nextTaxable);
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
        value={amount}
        disabled={pending}
        placeholder="0"
        onChange={(e) => setAmount(e.target.value)}
        onBlur={() => save()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="input en"
        style={{ width: 78, textAlign: "right", padding: "4px 6px", fontSize: 12.5 }}
        title="プラス=支給／マイナス=控除。例: 立替精算 2200 / 制服代 -3000"
      />
      <input
        type="text"
        value={label}
        disabled={pending}
        placeholder="摘要"
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => save()}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="input"
        style={{ width: 92, padding: "4px 6px", fontSize: 12.5 }}
        title="給与明細に印字されます"
      />
      <select
        value={taxable ? "1" : "0"}
        disabled={pending}
        onChange={(e) => {
          const t = e.target.value === "1";
          setTaxable(t);
          save(t);
        }}
        className="select"
        style={{ width: 74, padding: "4px 18px 4px 6px", fontSize: 12 }}
        title="課税=手当など（所得税・社保の対象）／非課税=立替金の精算など"
      >
        <option value="1">課税</option>
        <option value="0">非課税</option>
      </select>
      {saved && <span style={{ color: "#3d6b4f", fontSize: 11 }}>✓</span>}
    </span>
  );
}
