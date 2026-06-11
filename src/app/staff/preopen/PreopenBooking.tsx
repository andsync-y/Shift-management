"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PreopenReservation, Profile } from "@/lib/types";
import { PREOPEN_BEDS, PREOPEN_DAYS, hm } from "@/lib/preopen";
import { addReservation, removeReservation } from "./actions";

function surname(name: string) {
  return name.split(/[\s　]/)[0];
}

export default function PreopenBooking({
  meId,
  meName,
  staff,
  reservations,
  isAdmin = false,
}: {
  meId: string;
  meName: string;
  staff: Pick<Profile, "id" | "full_name">[];
  reservations: PreopenReservation[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // 入力中の枠 → 名前
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const staffMap = new Map(staff.map((s) => [s.id, s.full_name]));

  function keyOf(date: string, start: string) {
    return `${date}_${start}`;
  }
  function slotReservations(date: string, start: string) {
    return reservations.filter((r) => r.reserve_date === date && hm(r.start_time) === start);
  }

  function add(date: string, start: string) {
    const k = keyOf(date, start);
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
    <>
      {msg && (
        <p className={"liff-msg " + (msg.ok ? "ok" : "err")} style={{ marginTop: 0 }}>
          {msg.text}
        </p>
      )}

      {PREOPEN_DAYS.map((day) => (
        <div className="section" key={day.date}>
          <div className="section-head">
            <h2>{day.label}</h2>
            {day.note && <span className="eyebrow">{day.note}</span>}
          </div>
          <div className="section-body" style={{ display: "grid", gap: 14 }}>
            {day.rounds.map((round) => {
              const list = slotReservations(day.date, round.start);
              const full = list.length >= PREOPEN_BEDS;
              const k = keyOf(day.date, round.start);
              return (
                <div
                  key={round.start}
                  style={{
                    border: "1px solid var(--line, #e6e6e6)",
                    borderRadius: 10,
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                    <strong className="en">
                      {round.start}–{round.end}
                    </strong>
                    <span className={"mk " + (full ? "late" : "early")} style={{ fontSize: 11 }}>
                      {list.length}/{PREOPEN_BEDS}名{full ? "・満席" : ""}
                    </span>
                  </div>

                  {list.length > 0 && (
                    <ul style={{ listStyle: "none", margin: "0 0 8px", padding: 0, display: "grid", gap: 4 }}>
                      {list.map((r) => {
                        const mine = r.staff_id === meId;
                        const canDelete = mine || isAdmin;
                        return (
                          <li
                            key={r.id}
                            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}
                          >
                            <span style={{ fontWeight: 600 }}>{r.customer_name}</span>
                            <span className="soft" style={{ fontSize: 12 }}>
                              （担当：{surname(staffMap.get(r.staff_id) ?? "?")}）
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

                  {!full ? (
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
                      />
                      <button
                        className="btn-outline"
                        onClick={() => add(day.date, round.start)}
                        disabled={pending}
                        style={{ fontSize: 13 }}
                      >
                        この枠に予約
                      </button>
                    </div>
                  ) : (
                    <p className="help" style={{ margin: 0 }}>
                      満席です。別の時間枠を選んでください。
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <p className="help">
        ※ 自分が登録した予約だけ削除できます。各枠は{PREOPEN_BEDS}名（ベッド数）まで。施術は90分です。
      </p>
    </>
  );
}
