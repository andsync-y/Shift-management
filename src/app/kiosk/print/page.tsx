"use client";

import { useCallback, useEffect, useState } from "react";
import { DAY_LABELS_JA, type Profile, type Shift, type TimeOffRequest } from "@/lib/types";
import { displayName } from "@/lib/display-name";

// タブレット（キオスク）からのシフト表印刷。/api/kiosk/shifts を取得し、
// スタッフ×日のマトリクスを印刷レイアウトで表示 → window.print()（Brother iPrint&Scan 等で印刷）。

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function monthShift(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

type Data = { year: number; month: number; shifts: Shift[]; staff: Profile[]; timeOff: TimeOffRequest[] };

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

  // マトリクス構築
  const [y, m] = month ? month.split("-").map(Number) : [0, 0];
  const lastDay = y ? new Date(y, m, 0).getDate() : 0;
  const days = Array.from({ length: lastDay }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);

  const shiftByKey = new Map<string, Shift[]>();
  for (const s of data?.shifts ?? []) {
    const k = `${s.staff_id}|${s.work_date}`;
    (shiftByKey.get(k) ?? shiftByKey.set(k, []).get(k)!).push(s);
  }
  const offByKey = new Set<string>();
  for (const t of data?.timeOff ?? []) {
    if (t.request_type === "off" && !t.start_time && !t.end_time) offByKey.add(`${t.staff_id}|${t.off_date}`);
  }
  const staffWithShift = (data?.staff ?? []).filter((s) => (data?.shifts ?? []).some((sh) => sh.staff_id === s.id));

  function cell(staffId: string, date: string): string {
    const ss = shiftByKey.get(`${staffId}|${date}`);
    if (ss && ss.length) {
      return ss
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
        .map((s) => `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`)
        .join(" / ");
    }
    if (offByKey.has(`${staffId}|${date}`)) return "休";
    return "";
  }
  const weekday = (date: string) => DAY_LABELS_JA[new Date(date + "T00:00:00").getDay()];
  const dnum = (date: string) => Number(date.slice(8, 10));

  return (
    <div className="print-root">
      <div className="print-controls no-print">
        <a href="/kiosk" className="btn-outline">← 戻る</a>
        <span className="seg" role="group">
          <button onClick={() => setMonth(monthShift(month, -1))}>← 前月</button>
          <button onClick={() => setMonth(monthShift(month, 1))}>翌月 →</button>
        </span>
        <button className="btn-fill" onClick={() => window.print()}>🖨 印刷</button>
        <span className="help" style={{ margin: 0 }}>
          Brother iPrint&amp;Scan 等で印刷（横向き A4 推奨）
        </span>
      </div>

      {err ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--ink-2)" }}>{err}</div>
      ) : !data ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--ink-2)" }}>読み込み中…</div>
      ) : staffWithShift.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--ink-2)" }}>
          {y}年{m}月のシフトはありません。
        </div>
      ) : (
        <div className="print-sheet landscape">
          <div className="print-head">
            <h1>
              {y}年{m}月 シフト表
            </h1>
            <div className="print-store">全力ストレッチ岐阜長良店</div>
          </div>
          <table className="print-table">
            <thead>
              <tr>
                <th className="pt-name">スタッフ</th>
                {days.map((d) => {
                  const w = weekday(d);
                  const cls = w === "日" ? "sun" : w === "土" ? "sat" : "";
                  return (
                    <th key={d} className={cls}>
                      {dnum(d)}
                      <span className="pt-w">{w}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {staffWithShift.map((s) => (
                <tr key={s.id}>
                  <th className="pt-name">{displayName(s)}</th>
                  {days.map((d) => {
                    const v = cell(s.id, d);
                    const w = weekday(d);
                    const cls = (w === "日" ? "sun" : w === "土" ? "sat" : "") + (v === "休" ? " off" : "");
                    return (
                      <td key={d} className={cls}>
                        {v}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
