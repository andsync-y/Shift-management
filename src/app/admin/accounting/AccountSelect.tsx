"use client";

import { ACCOUNTS } from "@/lib/accounting/accounts";

// 勘定科目のセレクト。以前は datalist（サジェスト付き input）だったが、
// iOS Safari は datalist の候補を表示しないため、ネイティブ select に統一
// （スマホでは標準のピッカーが出る）。候補外の既存値は選択肢に含めて表示を保つ。
export default function AccountSelect({
  value,
  onChange,
  disabled,
  width = 130,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  width?: number;
}) {
  const extra = value && !(ACCOUNTS as readonly string[]).includes(value) ? [value] : [];
  return (
    <select
      className="select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{ width, padding: "6px 8px", fontSize: 13 }}
    >
      <option value="">—</option>
      {extra.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
      {ACCOUNTS.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
    </select>
  );
}
