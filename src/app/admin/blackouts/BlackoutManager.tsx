"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Profile, StaffBlackout } from "@/lib/types";
import { deleteBlackout, extractBlackouts, saveBlackouts } from "./actions";

type Row = { date: string; start: string; end: string; title: string };

function surname(name: string) {
  return name.split(/[\s　]/)[0];
}

export default function BlackoutManager({
  staff,
  blackouts,
}: {
  staff: Pick<Profile, "id" | "full_name">[];
  blackouts: StaffBlackout[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [staffId, setStaffId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const staffName = new Map(staff.map((s) => [s.id, s.full_name]));

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      startTransition(async () => {
        const res = await extractBlackouts({ imageDataUrl: dataUrl, year });
        setMsg({ ok: res.ok, text: res.ok ? `${res.events.length}件 読み取りました。内容を確認して保存してください。` : res.message ?? "解析に失敗しました。" });
        if (res.ok) setRows(res.events);
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function save() {
    if (!staffId) {
      setMsg({ ok: false, text: "スタッフを選択してください。" });
      return;
    }
    startTransition(async () => {
      const res = await saveBlackouts({ staffId, events: rows });
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) {
        setRows([]);
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    if (!confirm("この予定を削除しますか？")) return;
    startTransition(async () => {
      const res = await deleteBlackout(id);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });
  }

  // スタッフごとに既存の不可時間をまとめる
  const byStaff = new Map<string, StaffBlackout[]>();
  for (const b of blackouts) {
    if (!byStaff.has(b.staff_id)) byStaff.set(b.staff_id, []);
    byStaff.get(b.staff_id)!.push(b);
  }

  return (
    <>
      <div className="section">
        <div className="section-head">
          <h2>タイムツリーから取り込み</h2>
          <span className="eyebrow">画像→不可時間</span>
        </div>
        <div className="section-body">
          {msg && (
            <p className={"liff-msg " + (msg.ok ? "ok" : "err")} style={{ marginTop: 0 }}>
              {msg.text}
            </p>
          )}

          <div className="bk-row" style={{ marginBottom: 14 }}>
            <select
              className="input"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              disabled={pending}
              style={{ width: "auto", minWidth: 160 }}
            >
              <option value="">対象スタッフ</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
            <select
              className="input en"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              disabled={pending}
              style={{ width: "auto" }}
            >
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
            <label className="btn-outline" style={{ cursor: "pointer", fontSize: 13 }}>
              画像を選んで解析
              <input type="file" accept="image/*" onChange={onFile} disabled={pending} hidden />
            </label>
          </div>

          {pending && rows.length === 0 && <p className="help">解析中…</p>}

          {rows.length > 0 && (
            <>
              <div style={{ display: "grid", gap: 6 }}>
                {rows.map((r, i) => (
                  <div key={i} className="bk-row">
                    <input
                      className="input en"
                      type="date"
                      value={r.date}
                      onChange={(e) => update(i, { date: e.target.value })}
                      disabled={pending}
                      style={{ width: "auto" }}
                    />
                    <input
                      className="input en"
                      type="time"
                      value={r.start}
                      onChange={(e) => update(i, { start: e.target.value })}
                      disabled={pending}
                      style={{ width: "auto" }}
                    />
                    <span className="soft">–</span>
                    <input
                      className="input en"
                      type="time"
                      value={r.end}
                      onChange={(e) => update(i, { end: e.target.value })}
                      disabled={pending}
                      style={{ width: "auto" }}
                    />
                    <input
                      className="input"
                      placeholder="予定名"
                      value={r.title}
                      onChange={(e) => update(i, { title: e.target.value })}
                      disabled={pending}
                      style={{ flex: 1, minWidth: 120 }}
                    />
                    <button
                      type="button"
                      className="po-edit-x"
                      onClick={() => removeRow(i)}
                      disabled={pending}
                      aria-label="削除"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <button className="btn-fill" onClick={save} disabled={pending}>
                  {pending ? "保存中..." : `${staffId ? surname(staffName.get(staffId) ?? "") + "さんの" : ""}不可時間として保存`}
                </button>
              </div>
            </>
          )}

          <p className="help" style={{ marginBottom: 0 }}>
            時刻が空の予定は「終日不可」として登録します。保存後はシフト生成でこの時間を避けます。
            （週/日表示のスクショの方が読み取り精度が上がります）
          </p>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>登録済みの不可時間</h2>
          <span className="eyebrow">{blackouts.length}件</span>
        </div>
        <div className="section-body">
          {blackouts.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>
              まだありません。
            </p>
          ) : (
            [...byStaff.entries()].map(([sid, list]) => (
              <div key={sid} style={{ marginBottom: 12 }}>
                <div className="eyebrow" style={{ margin: "0 0 6px", fontWeight: 700 }}>
                  {staffName.get(sid) ?? "?"}
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
                  {list.map((b) => (
                    <li key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                      <span className="en">
                        {b.blackout_date.slice(5).replace("-", "/")}{" "}
                        {b.start_time && b.end_time
                          ? `${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)}`
                          : "終日"}
                      </span>
                      <span style={{ fontWeight: 600 }}>{b.title ?? "予定"}</span>
                      <button
                        onClick={() => remove(b.id)}
                        disabled={pending}
                        style={{
                          marginLeft: "auto",
                          border: 0,
                          background: "none",
                          color: "var(--accent-ink, #b4532a)",
                          cursor: "pointer",
                          fontSize: 12.5,
                        }}
                      >
                        削除
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
