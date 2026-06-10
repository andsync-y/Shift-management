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
// "YYYY-MM-DD" + n日
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export default function TimeCardManager({
  staff,
  records,
  month,
}: {
  staff: Pick<Profile, "id" | "full_name" | "display_color">[];
  records: (TimeRecord & { staffName: string })[];
  month: string;
}) {
  const router = useRouter();
  const [addState, addAction, adding] = useActionState(addTimeRecord, null);
  const [pending, startTransition] = useTransition();
  // 編集状態は完全な datetime-local 文字列で保持（時刻だけ画面で編集）
  const [edit, setEdit] = useState<Record<string, { in: string; out: string }>>({});

  const colorOf = useMemo(() => {
    const m = new Map(staff.map((s) => [s.id, s.display_color]));
    return (id: string) => m.get(id) ?? "var(--ink-3)";
  }, [staff]);

  // 絞り込み
  const [staffId, setStaffId] = useState("");
  const [day, setDay] = useState(""); // yyyy-mm-dd（その月内）
  const [openOnly, setOpenOnly] = useState(false);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (staffId && r.staff_id !== staffId) return false;
      if (day && r.work_date !== day) return false;
      if (openOnly && r.clock_out) return false;
      return true;
    });
  }, [records, staffId, day, openOnly]);

  const openTotal = useMemo(() => records.filter((r) => !r.clock_out).length, [records]);

  // 時刻のみ編集：既存の日付部分は保持し、時刻だけ差し替える。
  // 退勤が未設定の行は出勤日を基準にし、出勤時刻より前なら翌日扱い（日跨ぎ）。
  function setTime(rec: TimeRecord, key: "in" | "out", time: string) {
    setEdit((e) => {
      const cur = e[rec.id] ?? { in: toLocalInput(rec.clock_in), out: toLocalInput(rec.clock_out) };
      const next = { ...cur };
      if (key === "in") {
        const date = cur.in ? cur.in.split("T")[0] : rec.work_date;
        next.in = time ? `${date}T${time}` : "";
      } else {
        if (!time) {
          next.out = "";
        } else {
          let date = cur.out ? cur.out.split("T")[0] : rec.work_date;
          const inTime = (cur.in || "T").split("T")[1] ?? "";
          if (!cur.out && inTime && time < inTime) date = addDays(rec.work_date, 1); // 日跨ぎ
          next.out = `${date}T${time}`;
        }
      }
      return { ...e, [rec.id]: next };
    });
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
  const groups: { date: string; rows: typeof filtered }[] = [];
  for (const r of filtered) {
    const last = groups[groups.length - 1];
    if (last && last.date === r.work_date) last.rows.push(r);
    else groups.push({ date: r.work_date, rows: [r] });
  }

  return (
    <>
      {/* 手動追加（打刻漏れの補正用） */}
      <form action={addAction} className="tc-add">
        <div className="field">
          <label>Staff <span className="jp-label">／ スタッフ</span></label>
          <select name="staff_id" className="select" required defaultValue="">
            <option value="" disabled>選択</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Clock in <span className="jp-label">／ 出勤</span></label>
          <input name="clock_in" type="datetime-local" className="input en" required />
        </div>
        <div className="field">
          <label>Clock out <span className="jp-label">／ 退勤（任意）</span></label>
          <input name="clock_out" type="datetime-local" className="input en" />
        </div>
        <button type="submit" className="btn-fill" disabled={adding} style={{ whiteSpace: "nowrap" }}>
          {adding ? "追加中…" : "勤怠を追加"}
        </button>
      </form>
      {addState && (
        <p className="help" style={{ margin: "0 0 10px", color: addState.ok ? "#3d6b4f" : "#9a3a30" }}>
          {addState.message}
        </p>
      )}

      {/* 絞り込みツールバー */}
      <div className="tc-toolbar">
        <select
          className="select"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          style={{ width: 130, padding: "9px 30px 9px 12px", fontSize: 13 }}
        >
          <option value="">全スタッフ</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
        <input
          type="date"
          className="input en"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          style={{ width: 140, padding: "9px 12px", fontSize: 13 }}
        />
        {day && (
          <button className="btn-link" onClick={() => setDay("")} disabled={pending}>クリア</button>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, cursor: "pointer" }}>
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          <span style={{ whiteSpace: "nowrap" }}>退勤漏れのみ（{openTotal}）</span>
        </label>
        <span className="tc-spacer" />
        <span className="muted en" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
          {filtered.length}<span style={{ fontFamily: "Zen Kaku Gothic New" }}>件</span>
        </span>
        <button className="btn-outline" onClick={exportCsv} style={{ padding: "6px 12px", fontSize: 12 }}>
          CSV
        </button>
      </div>

      {/* 一覧（内部スクロール） */}
      <div className="tc-list">
        {groups.length === 0 ? (
          <div className="tc-empty">
            <div className="eyebrow" style={{ marginBottom: 10 }}>No records</div>
            {records.length === 0
              ? "この月の打刻記録はありません。"
              : "条件に一致する打刻がありません。絞り込みを解除してください。"}
          </div>
        ) : groups.map((g) => (
          <div className="tc-day" key={g.date}>
            <div className="tc-day-head en">{dateLabel(g.date)}</div>
            {g.rows.map((r) => {
              const e = edit[r.id] ?? { in: toLocalInput(r.clock_in), out: toLocalInput(r.clock_out) };
              const open = !r.clock_out;
              return (
                <div className={"tc-row" + (open ? " open" : "")} key={r.id}>
                  <span className="tc-name tc-ellip" title={r.staffName}>
                    <span className="dot" style={{ background: colorOf(r.staff_id) }} />
                    <span className="tc-ellip">{r.staffName}</span>
                    {r.source === "manual" && (
                      <span className="mk late" style={{ fontSize: 10 }}>手動</span>
                    )}
                  </span>
                  <input
                    type="time"
                    className="input en tc-dt"
                    value={e.in.split("T")[1] ?? ""}
                    onChange={(ev) => setTime(r, "in", ev.target.value)}
                  />
                  <span className="muted arrow">→</span>
                  <input
                    type="time"
                    className="input en tc-dt"
                    value={e.out.split("T")[1] ?? ""}
                    onChange={(ev) => setTime(r, "out", ev.target.value)}
                  />
                  <span className="tc-badge">{open && <span className="live-dot" title="打刻中" />}</span>
                  <button className="btn-mini" onClick={() => save(r)} disabled={pending}>保存</button>
                  <button className="btn-mini ink" onClick={() => remove(r.id)} disabled={pending}>削除</button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
