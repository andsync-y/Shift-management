"use client";

import { useCallback, useEffect, useState } from "react";
import ShiftCalendarView from "@/components/ShiftCalendarView";
import type { Profile, Shift, TimeOffRequest } from "@/lib/types";

// タブレット（キオスク）からのシフト表印刷。
// kioskに出ているカレンダー表示（ShiftCalendarView）そのままを A4横で印刷する。

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function monthShift(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

type Data = { year: number; month: number; shifts: Shift[]; staff: Profile[]; timeOff: TimeOffRequest[] };

// このページ専用の印刷CSS（A4横・toolbar非表示・色を保持）。
const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 6mm; }
  body { background: #fff; }
  .no-print { display: none !important; }
  .kprint { padding: 0 !important; }
  .kprint-head { margin: 0 0 5px !important; }
  .kprint-head h1 { font-size: 14px !important; }
  /* 1枚に収めるため圧縮＋凡例は省略 */
  .kprint-cal .cal-toolbar, .kprint-cal .legend { display: none !important; }
  .kprint-cal .cal-scroll, .kprint-cal .cal-grid, .kprint-cal .cal-weeks { overflow: visible !important; }
  .kprint-cal .cal-dow { font-size: 9px !important; }
  .kprint-cal .cal-cell { min-height: 0 !important; padding: 2px 3px 3px !important; gap: 1px !important; }
  .kprint-cal .cal-daynum { font-size: 10px !important; }
  .kprint-cal .cal-events { gap: 1px !important; }
  .kprint-cal .evt { font-size: 8px !important; padding: 1px 3px !important; line-height: 1.2 !important; border-left-width: 2px !important; }
  .kprint-cal .evt .mk { font-size: 7px !important; }
  .kprint, .kprint * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

export default function KioskPrintPage() {
  const [token, setToken] = useState<string | null>(null);
  const [month, setMonth] = useState<string>("");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = typeof localStorage !== "undefined" ? localStorage.getItem("kiosk_token") : null;
    setToken(t);
    const url = new URL(window.location.href);
    const q = url.searchParams.get("month");
    const j = new Date(Date.now() + 9 * 3600 * 1000);
    setMonth(/^\d{4}-\d{2}$/.test(q ?? "") ? q! : `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}`);
  }, []);

  const load = useCallback(async (t: string, mo: string) => {
    try {
      const r = await fetch(`/api/kiosk/shifts?token=${encodeURIComponent(t)}&month=${mo}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) {
        setErr(j.error === "unauthorized" ? "このタブレットの認証が無効です。" : j.error);
        return;
      }
      setErr(null);
      setData({ year: j.year, month: j.month, shifts: j.shifts, staff: j.staff, timeOff: j.timeOff });
    } catch {
      setErr("通信に失敗しました。");
    }
  }, []);

  useEffect(() => {
    if (token && month) load(token, month);
  }, [token, month, load]);

  return (
    <div className="kprint" style={{ padding: "14px 18px 28px" }}>
      <style>{PRINT_CSS}</style>

      <div className="print-controls no-print">
        <a href="/kiosk" className="btn-outline">← 戻る</a>
        <span className="seg" role="group">
          <button onClick={() => setMonth(monthShift(month, -1))}>← 前月</button>
          <button onClick={() => setMonth(monthShift(month, 1))}>翌月 →</button>
        </span>
        <button className="btn-fill" onClick={() => window.print()}>🖨 印刷</button>
        <span className="help" style={{ margin: 0 }}>
          A4横で印刷（Brother iPrint&amp;Scan 等）。向きが縦のときは印刷ダイアログで「横」を選んでください。
        </span>
      </div>

      <div className="kprint-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "8px 2px 12px" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          {data ? `${data.year}年${data.month}月` : month} シフト表
        </h1>
        <span style={{ fontSize: 13, color: "var(--ink-2)" }}>全力ストレッチ岐阜長良店</span>
      </div>

      {err ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--ink-2)" }}>{err}</div>
      ) : !data ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--ink-2)" }}>読み込み中…</div>
      ) : (
        <div className="kprint-cal">
          <ShiftCalendarView
            year={data.year}
            month={data.month}
            shifts={data.shifts}
            staff={data.staff}
            timeOff={data.timeOff}
          />
        </div>
      )}
    </div>
  );
}
