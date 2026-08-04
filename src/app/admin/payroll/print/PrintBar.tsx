"use client";

export default function PrintBar({ label }: { label: string }) {
  return (
    <div className="print-controls no-print">
      <a href="/admin/payroll" className="btn-outline">← 戻る</a>
      <strong style={{ fontSize: 14 }}>{label}</strong>
      <button className="btn-fill" onClick={() => window.print()}>🖨 印刷</button>
      <span className="help" style={{ margin: 0 }}>A4縦・1人1枚で印刷されます</span>
    </div>
  );
}
