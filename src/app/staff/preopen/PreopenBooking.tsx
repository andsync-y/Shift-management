"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PreopenReservation, Profile } from "@/lib/types";
import { PREOPEN_DAYS, hm, slotKey } from "@/lib/preopen";
import { addReservation, removeReservation } from "./actions";

function surname(name: string) {
  return name.split(/[\s　]/)[0];
}

export default function PreopenBooking({
  meId,
  meName,
  staff,
  reservations,
  capacities,
  isAdmin = false,
}: {
  meId: string;
  meName: string;
  staff: Pick<Profile, "id" | "full_name" | "role">[];
  reservations: PreopenReservation[];
  // 枠キー(slotKey) → 受付数。
  capacities: Record<string, number>;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null); // 開いている枠キー
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const staffMap = new Map(staff.map((s) => [s.id, s]));

  // オーナーが取った予約は「フリー」、スタッフは姓を表示。
  function ownerLabel(staffId: string) {
    const p = staffMap.get(staffId);
    if (!p) return "?";
    return p.role === "super_admin" ? "フリー" : surname(p.full_name);
  }

  function slotReservations(date: string, start: string) {
    return reservations.filter((r) => r.reserve_date === date && hm(r.start_time) === start);
  }

  // 現在の枠に存在しない予約（受付時間の変更前に入ったもの）
  const validKeys = new Set(
    PREOPEN_DAYS.flatMap((d) => d.rounds.map((r) => slotKey(d.date, r.start)))
  );
  const orphans = reservations.filter((r) => !validKeys.has(slotKey(r.reserve_date, r.start_time)));

  function add(date: string, start: string) {
    const k = slotKey(date, start);
    const name = (draft[k] ?? "").trim();
    if (!name) {
      setMsg({ ok: false, text: "お客様の名前を入力してください。" });
      return;
    }
    startTransition(async () => {
      const res = await addReservation({ date, start, customerName: name });
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) {
        setDraft((d) => ({ ...d, [k]: "" }));
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    if (!confirm("この予約を削除しますか？")) return;
    startTransition(async () => {
      const res = await removeReservation(id);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="section">
      <div className="section-head">
        <h2>モデル客の予約</h2>
        <span className="eyebrow">枠を開いて名前を入力</span>
      </div>
      <div className="section-body">
        {msg && (
          <p className={"liff-msg " + (msg.ok ? "ok" : "err")} style={{ marginTop: 0 }}>
            {msg.text}
          </p>
        )}

        {PREOPEN_DAYS.map((day) => (
          <div key={day.date} style={{ marginBottom: 14 }}>
            <div
              className="eyebrow"
              style={{ margin: "4px 0 6px", display: "flex", alignItems: "baseline", gap: 8 }}
            >
              <span style={{ fontWeight: 700 }}>{day.label}</span>
              {day.note && <span style={{ fontWeight: 400 }}>{day.note}</span>}
            </div>

            <div className="acc">
              {day.rounds.map((round) => {
                const k = slotKey(day.date, round.start);
                const list = slotReservations(day.date, round.start);
                const cap = capacities[k] ?? 0;
                const closed = cap === 0;
                const full = !closed && list.length >= cap;
                const isOpen = open === k;
                const fill = closed ? "受付なし" : `${list.length}/${cap}`;
                return (
                  <div className={"acc-item" + (isOpen ? " open" : "")} key={k}>
                    <button
                      type="button"
                      className="acc-head"
                      onClick={() => setOpen(isOpen ? null : k)}
                      disabled={closed}
                    >
                      <span className="acc-chev">{isOpen ? "▾" : "▸"}</span>
                      <span className="en acc-time">
                        {round.start}–{round.end}
                      </span>
                      <span
                        className={"mk " + (closed || full ? "late" : "early")}
                        style={{ marginLeft: "auto", fontSize: 11 }}
                      >
                        {fill}
                        {full ? "・満" : ""}
                      </span>
                    </button>

                    {isOpen && !closed && (
                      <div className="acc-body">
                        {list.length > 0 && (
                          <ul
                            style={{
                              listStyle: "none",
                              margin: "0 0 8px",
                              padding: 0,
                              display: "grid",
                              gap: 4,
                            }}
                          >
                            {list.map((r) => {
                              const canDelete = r.staff_id === meId || isAdmin;
                              return (
                                <li
                                  key={r.id}
                                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}
                                >
                                  <span style={{ fontWeight: 600 }}>{r.customer_name}</span>
                                  <span className="soft" style={{ fontSize: 12 }}>
                                    （担当：{ownerLabel(r.staff_id)}）
                                  </span>
                                  {canDelete && (
                                    <button
                                      onClick={() => remove(r.id)}
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
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        {full ? (
                          <p className="help" style={{ margin: 0 }}>
                            満席です。別の枠を選んでください。
                          </p>
                        ) : (
                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              className="input"
                              placeholder={`${surname(meName)}さんのお客様の名前`}
                              value={draft[k] ?? ""}
                              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") add(day.date, round.start);
                              }}
                              style={{ flex: 1, fontSize: 14 }}
                              disabled={pending}
                              autoFocus
                            />
                            <button
                              className="btn-outline"
                              onClick={() => add(day.date, round.start)}
                              disabled={pending}
                              style={{ fontSize: 13 }}
                            >
                              予約
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {orphans.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div className="eyebrow" style={{ margin: "0 0 6px", fontWeight: 700 }}>
              時間変更が必要な予約
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {orphans.map((r) => {
                const canDelete = r.staff_id === meId || isAdmin;
                return (
                  <li key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                    <span className="en">
                      {r.reserve_date.slice(5).replace("-", "/")} {hm(r.start_time)}
                    </span>
                    <span style={{ fontWeight: 600 }}>{r.customer_name}</span>
                    <span className="soft" style={{ fontSize: 12 }}>
                      （担当：{ownerLabel(r.staff_id)}）
                    </span>
                    {canDelete && (
                      <button
                        onClick={() => remove(r.id)}
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
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="help" style={{ marginBottom: 0 }}>
              受付時間の変更前に入った予約です。お客様と調整のうえ削除し、新しい枠に入れ直してください。
            </p>
          </div>
        )}

        <p className="help" style={{ marginBottom: 0 }}>
          ※ 自分が登録した予約だけ削除できます。施術90分・各枠の受付数はプレオープン出勤表に連動。
        </p>
      </div>
    </div>
  );
}
