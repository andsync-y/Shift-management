"use client";

import { useActionState, useState, useTransition } from "react";
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

export default function TimeCardManager({
  staff,
  records,
}: {
  staff: Pick<Profile, "id" | "full_name">[];
  records: (TimeRecord & { staffName: string })[];
}) {
  const router = useRouter();
  const [addState, addAction, adding] = useActionState(addTimeRecord, null);
  const [pending, startTransition] = useTransition();
  const [edit, setEdit] = useState<Record<string, { in: string; out: string }>>({});

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

  return (
    <div>
      {/* 手動追加（打刻漏れの補正用） */}
      <form action={addAction} className="add-row" style={{ alignItems: "flex-end", marginBottom: 22 }}>
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

      {records.length === 0 ? (
        <p className="help" style={{ margin: 0 }}>この月の打刻記録はありません。</p>
      ) : (
        <div className="history-list">
          {records.map((r) => {
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
      )}
    </div>
  );
}
