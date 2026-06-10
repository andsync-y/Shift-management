"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTimeRecord, updateTimeRecord, deleteTimeRecord } from "./actions";
import type { Profile, TimeRecord } from "@/lib/types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
// ISO(UTC) → datetime-local 表示用（JST）
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const j = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}T${pad(
    j.getUTCHours()
  )}:${pad(j.getUTCMinutes())}`;
}
function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
}
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
function dateLabel(workDate: string): string {
  const [y, m, d] = workDate.split("-").map(Number);
  const w = WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}（${w}）`;
}
function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const DEFAULT_LIMIT = 50;

export default function TimeCardManager({
  staff,
  records,
  month,
}: {
  staff: Pick<Profile, "id" | "full_name">[];
  records: (TimeRecord & { staffName: string })[];
  month: string;
}) {
  const router = useRouter();
  const [addState, addAction, adding] = useActionState(addTimeRecord, null);
  const [pending, startTransition] = useTransition();
  const [edit, setEdit] = useState<Record<string, { in: string; out: string }>>({});

  // 絞り込み
  const [staffId, setStaffId] = useState("");
  const [day, setDay] = useState(""); // yyyy-mm-dd（その月内）
  const [openOnly, setOpenOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (staffId && r.staff_id !== staffId) return false;
      if (day && r.work_date !== day) return false;
      if (openOnly && r.clock_out) return false;
      return true;
    });
  }, [records, staffId, day, openOnly]);

  const visible = showAll ? filtered : filtered.slice(0, DEFAULT_LIMIT);
  const hiddenCount = filtered.length - visible.length;
  const openTotal = useMemo(() => records.filter((r) => !r.clock_out).length, [records]);

  function setField(id: string, key: "in" | "out", v: string, rec: TimeRecord) {
    setEdit((e) => ({
      ...e,
      [id]: {
        in: key === "in" ? v : e[id]?.in ?? toLocalInput(rec.clock_in),
        out: key === "out" ? v : e[id]?.out ?? toLocalInput(rec.clock_out),
      },
    }));
  }
  function save(rec: TimeRecord) {
    const e = edit[rec.id] ?? { in: toLocalInput(rec.clock_in), out: toLocalInput(rec.clock_out) };
    startTransition(async () => {
      const r = await updateTimeRecord(rec.id, e.in, e.out);
      if (!r.ok) alert(r.message);
      router.refresh();
    });
  }
  function remove(id: string) {
    if (!confirm("この勤怠記録を削除します。よろしいですか？")) return;
    startTransition(async () => {
      await deleteTimeRecord(id);
      router.refresh();
    });
  }

  // CSV（その月の全記録を出力。給与計算用）
  function exportCsv() {
    const header = ["スタッフ", "日付", "出勤", "退勤", "勤務時間(分)", "種別"];
    const lines = records.map((r) => {
      const mins = minutesBetween(r.clock_in, r.clock_out);
      return [
        r.staffName,
        r.work_date,
        r.clock_in ? toLocalInput(r.clock_in).replace("T", " ") : "",
        r.clock_out ? toLocalInput(r.clock_out).replace("T", " ") : "",
        mins == null ? "" : String(mins),
        r.source ?? "",
      ];
    });
    const csv = [header, ...lines].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timecards_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 表示用に日付ごとへグループ化（records は clock_in 降順で渡ってくる）
  const groups: { date: string; rows: typeof visible }[] = [];
  for (const r of visible) {
    const last = groups[groups.length - 1];
    if (last && last.date === r.work_date) last.rows.push(r);
    else groups.push({ date: r.work_date, rows: [r] });
  }

  return (
    <div className="tc-compact">
      {/* 手動追加（打刻漏れの補正用） */}
      <form action={addAction} className="add-row" style={{ alignItems: "flex-end", marginBottom: 18 }}>
        <div className="field">
          <label>Staff <span className="jp-label">／ スタッフ</span></label>
          <select name="staff_id" className="select" required defaultValue="" style={{ width: 160 }}>
            <option value="" disabled>選択</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Clock in <span className="jp-label">／ 出勤</span></label>
          <input name="clock_in" type="datetime-local" className="input" required />
        </div>
        <div className="field">
          <label>Clock out <span className="jp-label">／ 退勤（任意）</span></label>
          <input name="clock_out" type="datetime-local" className="input" />
        </div>
        <button type="submit" className="btn-fill" disabled={adding} style={{ padding: "12px 22px" }}>
          {adding ? "追加中…" : "勤怠を追加"}
        </button>
        {addState && (
          <span className="help" style={{ color: addState.ok ? "#3d6b4f" : "#9a3a30" }}>
            {addState.message}
          </span>
        )}
      </form>

      {/* 絞り込みツールバー */}
      <div
        className="tc-filter"
        style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}
      >
        <select
          className="select"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          style={{ width: 160 }}
        >
          <option value="">全スタッフ</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
        <input
          type="date"
          className="input"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          style={{ width: 160 }}
        />
        {day && (
          <button className="btn-link" onClick={() => setDay("")} disabled={pending}>日付クリア</button>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          退勤漏れのみ{openTotal > 0 && `（${openTotal}）`}
        </label>
        <span style={{ flex: 1 }} />
        <span className="help" style={{ margin: 0 }}>
          {filtered.length}件{filtered.length !== records.length && ` / 全${records.length}件`}
        </span>
        <button className="btn-outline" onClick={exportCsv} style={{ padding: "8px 16px" }}>
          CSV
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="help" style={{ margin: 0 }}>
          {records.length === 0 ? "この月の打刻記録はありません。" : "条件に合う記録はありません。"}
        </p>
      ) : (
        <>
          <div className="history-list tc-scroll">
            {groups.map((g) => (
              <div key={g.date} style={{ marginBottom: 6 }}>
                <div
                  className="eyebrow"
                  style={{ padding: "8px 2px 4px", fontSize: 11, opacity: 0.7 }}
                >
                  {dateLabel(g.date)}
                </div>
                {g.rows.map((r) => {
                  const e = edit[r.id] ?? { in: toLocalInput(r.clock_in), out: toLocalInput(r.clock_out) };
                  return (
                    <div className="tc-row" key={r.id}>
                      <span className="tc-name">
                        {r.staffName}
                        {r.source === "manual" && <span className="mk late" style={{ marginLeft: 8, fontSize: 10 }}>手動</span>}
                      </span>
                      <input
                        type="datetime-local"
                        className="input tc-input"
                        value={e.in}
                        onChange={(ev) => setField(r.id, "in", ev.target.value, r)}
                      />
                      <span className="tc-sep">→</span>
                      <input
                        type="datetime-local"
                        className="input tc-input"
                        value={e.out}
                        onChange={(ev) => setField(r.id, "out", ev.target.value, r)}
                      />
                      {!r.clock_out && <span className="mk early" style={{ fontSize: 10 }}>打刻中</span>}
                      <span className="tc-actions">
                        <button className="btn-link" onClick={() => save(r)} disabled={pending}>保存</button>
                        <button className="btn-link ink" onClick={() => remove(r.id)} disabled={pending}>削除</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {hiddenCount > 0 && (
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <button className="btn-outline" onClick={() => setShowAll(true)}>
                残り {hiddenCount} 件を表示
              </button>
            </div>
          )}
          {showAll && filtered.length > DEFAULT_LIMIT && (
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <button className="btn-link" onClick={() => setShowAll(false)}>最新{DEFAULT_LIMIT}件だけ表示に戻す</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
