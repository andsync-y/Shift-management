"use client";

import { useMemo, useState } from "react";
import { DAY_LABELS_JA, type Profile, type Shift } from "@/lib/types";

type ViewMode = "month" | "week" | "day";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function hm(t: string) {
  return t.slice(0, 5);
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export default function ShiftCalendarView({
  year,
  month,
  shifts,
  staff,
  highlightStaffId,
}: {
  year: number;
  month: number;
  shifts: Shift[];
  staff: Profile[];
  highlightStaffId?: string;
}) {
  const [mode, setMode] = useState<ViewMode>("month");
  // 表示の基準日（週・日ビューで使用）。既定は対象月の1日。
  const [cursor, setCursor] = useState<Date>(new Date(year, month - 1, 1));
  // スタッフ絞り込み（空 = 全員表示）
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);

  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  // この期間にシフトがあるスタッフのみ絞り込み候補に出す
  const staffInShifts = useMemo(() => {
    const ids = new Set(shifts.map((s) => s.staff_id));
    return staff.filter((s) => ids.has(s.id));
  }, [shifts, staff]);

  const visibleShifts = useMemo(
    () => (selected.size === 0 ? shifts : shifts.filter((s) => selected.has(s.staff_id))),
    [shifts, selected]
  );

  function toggleStaff(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const byDate = useMemo(() => {
    const m: Record<string, Shift[]> = {};
    for (const s of visibleShifts) (m[s.work_date] ??= []).push(s);
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return m;
  }, [visibleShifts]);

  function chip(s: Shift, opts?: { compact?: boolean }) {
    const p = staffMap.get(s.staff_id);
    const mine = highlightStaffId && s.staff_id === highlightStaffId;
    return (
      <span
        key={s.id}
        className={`inline-flex max-w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs ${
          mine ? "ring-2 ring-brand" : ""
        }`}
        style={{
          backgroundColor: (p?.display_color ?? "#999") + "22",
          color: p?.display_color ?? "#333",
        }}
        title={`${p?.full_name ?? "?"} ${hm(s.start_time)}–${hm(s.end_time)}`}
      >
        <span className="font-medium">{p?.full_name ?? "?"}</span>
        {!opts?.compact && (
          <span className="text-[10px] opacity-80">
            {hm(s.start_time)}–{hm(s.end_time)}
          </span>
        )}
      </span>
    );
  }

  // --- 月ビュー ------------------------------------------------------
  function MonthView() {
    const first = new Date(year, month - 1, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month - 1, d));
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7 gap-px rounded-md bg-gray-200">
          {DAY_LABELS_JA.map((d, i) => (
            <div
              key={d}
              className={`bg-gray-50 py-1 text-center text-xs font-semibold ${
                i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-600"
              }`}
            >
              {d}
            </div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={i} className="min-h-[84px] bg-gray-50/50" />;
            const key = ymd(date);
            const dayShifts = byDate[key] ?? [];
            const dow = date.getDay();
            return (
              <button
                key={i}
                onClick={() => {
                  setCursor(date);
                  setMode("day");
                }}
                className="min-h-[84px] bg-white p-1 text-left align-top hover:bg-brand-light/40"
              >
                <div
                  className={`mb-0.5 text-xs font-semibold ${
                    dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-gray-700"
                  }`}
                >
                  {date.getDate()}
                </div>
                <div className="flex flex-col gap-0.5">
                  {dayShifts.slice(0, 5).map((s) => {
                    const p = staffMap.get(s.staff_id);
                    const mine = highlightStaffId && s.staff_id === highlightStaffId;
                    return (
                      <span
                        key={s.id}
                        className={`block truncate rounded px-1 py-0.5 text-[11px] leading-tight ${
                          mine ? "ring-1 ring-brand" : ""
                        }`}
                        style={{
                          backgroundColor: (p?.display_color ?? "#999") + "22",
                          color: p?.display_color ?? "#333",
                        }}
                        title={`${p?.full_name ?? "?"} ${hm(s.start_time)}–${hm(s.end_time)}`}
                      >
                        <span className="font-medium">{p?.full_name ?? "?"}</span>
                        <span className="ml-1 opacity-75">
                          {hm(s.start_time)}–{hm(s.end_time)}
                        </span>
                      </span>
                    );
                  })}
                  {dayShifts.length > 5 && (
                    <span className="text-[10px] text-gray-400">＋{dayShifts.length - 5}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // --- 週ビュー ------------------------------------------------------
  function WeekView() {
    const weekStart = addDays(cursor, -cursor.getDay());
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    return (
      <div className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-7 gap-px rounded-md bg-gray-200">
          {days.map((date) => {
            const dow = date.getDay();
            const inMonth = date.getMonth() === month - 1;
            return (
              <div
                key={ymd(date)}
                className={`bg-gray-50 py-1 text-center text-xs font-semibold ${
                  dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-gray-600"
                } ${inMonth ? "" : "opacity-40"}`}
              >
                {date.getMonth() + 1}/{date.getDate()}（{DAY_LABELS_JA[dow]}）
              </div>
            );
          })}
          {days.map((date) => {
            const dayShifts = byDate[ymd(date)] ?? [];
            const inMonth = date.getMonth() === month - 1;
            return (
              <div
                key={"c" + ymd(date)}
                className={`min-h-[180px] bg-white p-1.5 ${inMonth ? "" : "bg-gray-50/60"}`}
              >
                <div className="flex flex-col gap-1">
                  {dayShifts.length === 0 && (
                    <span className="text-[10px] text-gray-300">—</span>
                  )}
                  {dayShifts.map((s) => chip(s))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // --- 日ビュー ------------------------------------------------------
  function DayView() {
    const key = ymd(cursor);
    const dayShifts = byDate[key] ?? [];
    const HOURS = Array.from({ length: 13 }, (_, i) => 10 + i); // 10〜22時
    return (
      <div className="space-y-3">
        {dayShifts.length === 0 ? (
          <p className="text-sm text-gray-400">この日のシフトはありません。</p>
        ) : (
          <ul className="space-y-1.5">
            {dayShifts.map((s) => {
              const p = staffMap.get(s.staff_id);
              const startH = Number(s.start_time.slice(0, 2)) + Number(s.start_time.slice(3, 5)) / 60;
              const endH = Number(s.end_time.slice(0, 2)) + Number(s.end_time.slice(3, 5)) / 60;
              const left = ((startH - 10) / 12) * 100;
              const width = ((endH - startH) / 12) * 100;
              return (
                <li key={s.id} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 truncate text-sm font-medium">
                    {p?.full_name ?? "?"}
                  </span>
                  <div className="relative h-6 flex-1 rounded bg-gray-100">
                    <div
                      className="absolute top-0 flex h-6 items-center justify-center rounded px-1 text-[10px] text-white"
                      style={{
                        left: `${Math.max(0, left)}%`,
                        width: `${Math.min(100, width)}%`,
                        backgroundColor: p?.display_color ?? "#888",
                      }}
                    >
                      {hm(s.start_time)}–{hm(s.end_time)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-between px-24 text-[10px] text-gray-400">
          {HOURS.filter((_, i) => i % 2 === 0).map((h) => (
            <span key={h}>{h}時</span>
          ))}
        </div>
      </div>
    );
  }

  // --- ナビゲーション ------------------------------------------------
  function navLabel() {
    if (mode === "month") return `${year}年${month}月`;
    if (mode === "week") {
      const ws = addDays(cursor, -cursor.getDay());
      const we = addDays(ws, 6);
      return `${ws.getMonth() + 1}/${ws.getDate()} 〜 ${we.getMonth() + 1}/${we.getDate()}`;
    }
    return `${cursor.getMonth() + 1}/${cursor.getDate()}（${DAY_LABELS_JA[cursor.getDay()]}）`;
  }
  function nav(dir: -1 | 1) {
    if (mode === "week") setCursor(addDays(cursor, dir * 7));
    else if (mode === "day") setCursor(addDays(cursor, dir));
  }

  const TABS: { id: ViewMode; label: string }[] = [
    { id: "month", label: "月" },
    { id: "week", label: "週" },
    { id: "day", label: "日" },
  ];

  return (
    <div className="space-y-3">
      {/* スタッフ絞り込み（アコーディオン） */}
      <div className="rounded-md border border-gray-200">
        <button
          onClick={() => setFilterOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <span>
            スタッフで絞り込む
            {selected.size > 0 && (
              <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs text-white">
                {selected.size}名選択中
              </span>
            )}
          </span>
          <span className="text-gray-400">{filterOpen ? "▲" : "▼"}</span>
        </button>

        {filterOpen && (
          <div className="border-t border-gray-100 p-3">
            <div className="mb-2 flex flex-wrap gap-2">
              <button
                onClick={() => setSelected(new Set())}
                className={`rounded-full border px-3 py-1 text-xs ${
                  selected.size === 0
                    ? "border-brand bg-brand text-white"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                全員
              </button>
              {staffInShifts.map((s) => {
                const on = selected.has(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleStaff(s.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                      on ? "border-transparent text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                    style={on ? { backgroundColor: s.display_color } : undefined}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: s.display_color }}
                    />
                    {s.full_name}
                  </button>
                );
              })}
              {staffInShifts.length === 0 && (
                <span className="text-xs text-gray-400">表示できるスタッフがいません。</span>
              )}
            </div>
            <p className="text-[11px] text-gray-400">
              名前をタップで複数選択。「全員」で絞り込み解除。
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-gray-300">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className={`px-4 py-1.5 text-sm ${
                mode === t.id ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {mode !== "month" && (
            <button onClick={() => nav(-1)} className="btn-secondary px-2 py-1 text-xs">
              ←
            </button>
          )}
          <span className="min-w-[120px] text-center text-sm font-semibold">{navLabel()}</span>
          {mode !== "month" && (
            <button onClick={() => nav(1)} className="btn-secondary px-2 py-1 text-xs">
              →
            </button>
          )}
        </div>
      </div>

      {mode === "month" && <MonthView />}
      {mode === "week" && <WeekView />}
      {mode === "day" && <DayView />}
    </div>
  );
}
