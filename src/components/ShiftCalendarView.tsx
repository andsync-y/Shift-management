"use client";

import { useMemo, useState } from "react";
import { DAY_LABELS_JA, type Profile, type Shift, type TimeOffRequest } from "@/lib/types";

type ViewMode = "month" | "week";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function hm(t: string) {
  return t.slice(0, 5);
}
function toMin(t: string) {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
// 開始が12時より前なら「早」、それ以降は「遅」
function shiftMark(start: string) {
  return Number(start.slice(0, 2)) < 12 ? "早" : "遅";
}
function band(color: string) {
  return `color-mix(in oklab, ${color} 16%, transparent)`;
}
// 苗字（スペース区切りの先頭）
function surname(fullName: string) {
  return fullName.split(/[\s　]/)[0];
}

export default function ShiftCalendarView({
  year,
  month,
  shifts,
  staff,
  highlightStaffId,
  timeOff = [],
}: {
  year: number;
  month: number;
  shifts: Shift[];
  staff: Profile[];
  highlightStaffId?: string;
  timeOff?: TimeOffRequest[];
}) {
  const [mode, setMode] = useState<ViewMode>("month");
  // 週ビューの基準日。既定は「最初にシフトがある日」を含む週。
  const [cursor, setCursor] = useState<Date>(() => {
    const dates = shifts.map((s) => s.work_date).sort();
    if (dates.length > 0) {
      const [y, m, d] = dates[0].split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date(year, month - 1, 1);
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

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

  // 承認済みの休み希望を日付ごとに索引化（スタッフ絞り込みを反映）
  const offByDate = useMemo(() => {
    const m: Record<string, TimeOffRequest[]> = {};
    for (const t of timeOff) {
      if (t.status !== "approved") continue;
      if (selected.size > 0 && !selected.has(t.staff_id)) continue;
      (m[t.off_date] ??= []).push(t);
    }
    return m;
  }, [timeOff, selected]);

  function color(staffId: string) {
    return staffMap.get(staffId)?.display_color ?? "#8e897f";
  }

  // 休み／時間変更チップ（承認済み）
  function OffEvt({ t }: { t: TimeOffRequest }) {
    const p = staffMap.get(t.staff_id);
    const isChange = t.request_type === "time_change";
    const time = t.start_time && t.end_time ? `${hm(t.start_time)}–${hm(t.end_time)}` : "終日";
    return (
      <div
        className={"evt " + (isChange ? "change" : "off")}
        title={`${p ? p.full_name : "?"} ${isChange ? "時間変更希望" : "休み"}（${time}）`}
      >
        <span className="nm">{p ? surname(p.full_name) : "?"}</span>
        <span className={"mk " + (isChange ? "change-mk" : "off-mk")}>
          {isChange ? "変" : "休"}
        </span>
        {isChange && t.start_time && t.end_time && (
          <span className="tm">
            {hm(t.start_time)}–{hm(t.end_time)}
          </span>
        )}
      </div>
    );
  }

  // 苗字＋早/遅マーク＋時間のチップ
  function Evt({ s, withTime = true }: { s: Shift; withTime?: boolean }) {
    const p = staffMap.get(s.staff_id);
    const mk = shiftMark(s.start_time);
    const mine = highlightStaffId && s.staff_id === highlightStaffId;
    return (
      <div
        className={"evt" + (mine ? " mine" : "")}
        style={{ background: band(color(s.staff_id)), borderLeftColor: color(s.staff_id) }}
      >
        <span className="nm">{p ? surname(p.full_name) : "?"}</span>
        <span className={"mk " + (mk === "早" ? "early" : "late")}>{mk}</span>
        {withTime && (
          <span className="tm">
            {hm(s.start_time)}–{hm(s.end_time)}
          </span>
        )}
      </div>
    );
  }

  // ---------------- 月ビュー ----------------
  function MonthView() {
    const first = new Date(year, month - 1, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month - 1, d));
    while (cells.length % 7 !== 0) cells.push(null);
    const today = ymd(new Date());

    return (
      <div className="cal-scroll">
      <div className="cal-grid">
        <div className="cal-dow">
          {DAY_LABELS_JA.map((w, i) => (
            <div key={w} className={i === 0 ? "sun" : i === 6 ? "sat" : ""}>
              {w}
            </div>
          ))}
        </div>
        <div className="cal-weeks">
          {cells.map((date, i) => {
            if (!date) return <div key={i} className="cal-cell blank" />;
            const key = ymd(date);
            const evts = byDate[key] ?? [];
            const offs = offByDate[key] ?? [];
            const dow = date.getDay();
            const cls =
              "cal-cell" +
              (dow === 0 ? " is-sun" : dow === 6 ? " is-sat" : "") +
              (key === today ? " is-today" : "");
            return (
              <div
                key={i}
                className={cls}
                role="button"
                onClick={() => {
                  setCursor(date);
                  setMode("week");
                }}
                style={{ cursor: "pointer" }}
              >
                <div className="cal-daynum">{date.getDate()}</div>
                <div className="cal-events">
                  {evts.map((s) => (
                    <Evt key={s.id} s={s} withTime={true} />
                  ))}
                  {offs.map((t) => (
                    <OffEvt key={t.id} t={t} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    );
  }

  // ---------------- 週ビュー（タイムライン）----------------
  function WeekView() {
    const weekStart = addDays(cursor, -cursor.getDay());
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const ticks = [10, 12, 14, 16, 18, 20, 22];
    return (
      <div className="tl">
        <div className="tl-ruler-row">
          <div className="sp" />
          <div className="tl-ruler">
            {ticks.map((h, i, arr) => {
              const left = ((h - 10) / 12) * 100;
              const tf =
                i === 0
                  ? "translateX(0)"
                  : i === arr.length - 1
                  ? "translateX(-100%)"
                  : "translateX(-50%)";
              return (
                <span className="tick en" key={h} style={{ left: left + "%", transform: tf }}>
                  {h}
                </span>
              );
            })}
          </div>
        </div>
        {days.map((date) => {
          const dow = date.getDay();
          const evts = byDate[ymd(date)] ?? [];
          const offs = offByDate[ymd(date)] ?? [];
          return (
            <div key={ymd(date)} className="tl-row">
              <div className="tl-day">
                <span
                  className="d en"
                  style={
                    dow === 0
                      ? { color: "var(--accent-ink)" }
                      : dow === 6
                      ? { color: "#4a6079" }
                      : undefined
                  }
                >
                  {date.getDate()}
                </span>
                <span className="w">（{DAY_LABELS_JA[dow]}）</span>
              </div>
              {evts.length || offs.length ? (
                <div className="tl-lanes">
                  {evts.map((s) => {
                    const p = staffMap.get(s.staff_id);
                    const a = toMin(s.start_time);
                    const b = toMin(s.end_time);
                    const left = ((a - 600) / 720) * 100;
                    const width = ((b - a) / 720) * 100;
                    const mk = shiftMark(s.start_time);
                    const mine = highlightStaffId && s.staff_id === highlightStaffId;
                    return (
                      <div className="tl-lane" key={s.id}>
                        <div
                          className="tl-bar"
                          style={{
                            left: `${Math.max(0, left)}%`,
                            width: `${Math.min(100, width)}%`,
                            background: band(color(s.staff_id)),
                            borderLeftColor: color(s.staff_id),
                            outline: mine ? "1.5px solid var(--accent)" : undefined,
                            outlineOffset: mine ? "-1.5px" : undefined,
                          }}
                        >
                          <span className="nm">{p ? surname(p.full_name) : "?"}</span>
                          <span className={"mk " + (mk === "早" ? "early" : "late")}>{mk}</span>
                          <span className="tm">
                            {hm(s.start_time)}–{hm(s.end_time)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {offs.map((t) => {
                    const p = staffMap.get(t.staff_id);
                    const isChange = t.request_type === "time_change";
                    const label =
                      t.start_time && t.end_time
                        ? `${hm(t.start_time)}–${hm(t.end_time)}`
                        : "終日";
                    return (
                      <div className="tl-off" key={t.id}>
                        <span className={"mk " + (isChange ? "change-mk" : "off-mk")}>
                          {isChange ? "変" : "休"}
                        </span>
                        <span className="nm">{p ? surname(p.full_name) : "?"}</span>
                        <span className="tm">{isChange ? `→ ${label}` : label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="tl-empty">— シフトなし</div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function weekLabel() {
    const ws = addDays(cursor, -cursor.getDay());
    const we = addDays(ws, 6);
    return `${ws.getMonth() + 1}/${ws.getDate()} – ${we.getMonth() + 1}/${we.getDate()}`;
  }

  return (
    <div>
      <div className="cal-toolbar">
        <div className="cal-filter">
          <select
            className="select"
            value={selected.size === 1 ? [...selected][0] : "all"}
            onChange={(e) => {
              const v = e.target.value;
              setSelected(v === "all" ? new Set() : new Set([v]));
            }}
          >
            <option value="all">スタッフで絞り込む — 全員</option>
            {staffInShifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
          <div className="seg" role="tablist">
            <button className={mode === "month" ? "on" : ""} onClick={() => setMode("month")}>
              月
            </button>
            <button className={mode === "week" ? "on" : ""} onClick={() => setMode("week")}>
              週
            </button>
          </div>
        </div>

        {mode === "month" ? (
          <div className="cal-month-label en">
            {year}.{pad(month)}
            <small>
              {year}年{month}月
            </small>
          </div>
        ) : (
          <div className="cal-nav">
            <button onClick={() => setCursor(addDays(cursor, -7))} aria-label="前の週">
              ←
            </button>
            <span className="cal-month-label en" style={{ fontSize: 16 }}>
              {weekLabel()}
            </span>
            <button onClick={() => setCursor(addDays(cursor, 7))} aria-label="次の週">
              →
            </button>
          </div>
        )}
      </div>

      {mode === "month" ? <MonthView /> : <WeekView />}

      {/* legend */}
      {staffInShifts.length > 0 && (
        <div className="legend">
          {staffInShifts.map((s) => {
            const on = selected.size === 0 || selected.has(s.id);
            return (
              <button
                key={s.id}
                className="item"
                onClick={() => toggleStaff(s.id)}
                style={{
                  background: "none",
                  border: 0,
                  cursor: "pointer",
                  opacity: on ? 1 : 0.4,
                }}
              >
                <span className="dot" style={{ background: s.display_color }} />
                {surname(s.full_name)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
