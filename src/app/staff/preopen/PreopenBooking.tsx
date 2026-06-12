"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PreopenReservation, Profile } from "@/lib/types";
import { PREOPEN_ALL_STARTS, PREOPEN_DAYS, hm, slotKey } from "@/lib/preopen";
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
  // 日付ごとの入力状態（枠・名前・担当区分）
  const [slotSel, setSlotSel] = useState<Record<string, string>>({});
  const [nameDraft, setNameDraft] = useState<Record<string, string>>({});
  const [assign, setAssign] = useState<Record<string, "self" | "free">>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const staffMap = new Map(staff.map((s) => [s.id, s]));
  const defaultAssign: "self" | "free" = isAdmin ? "free" : "self";

  function slotReservations(date: string, start: string) {
    return reservations.filter((r) => r.reserve_date === date && hm(r.start_time) === start);
  }
  function usedCount(date: string, start: string) {
    return reservations.filter((r) => r.reserve_date === date && hm(r.start_time) === start).length;
  }
  // 担当表示：フリー予約は「フリー」、それ以外は登録者の姓（旧データはオーナー登録＝フリー扱い）
  function assigneeLabel(r: PreopenReservation) {
    const p = staffMap.get(r.staff_id);
    const free = r.is_free || p?.role === "super_admin";
    return free ? "フリー" : surname(p?.full_name ?? "?");
  }

  // 予約チップ（PC表・スマホ縦リスト 共通）
  function chip(r: PreopenReservation) {
    const canDelete = r.staff_id === meId || isAdmin;
    const free = r.is_free || staffMap.get(r.staff_id)?.role === "super_admin";
    return (
      <span
        key={r.id}
        className={"bk-chip" + (free ? " free" : "")}
        title={`登録：${surname(staffMap.get(r.staff_id)?.full_name ?? "?")}`}
      >
        <span className="bk-chip-r1">
          <span className="bk-chip-nm">{r.customer_name}</span>
          {canDelete && (
            <button
              type="button"
              className="bk-chip-x"
              onClick={() => remove(r.id)}
              disabled={pending}
              aria-label="削除"
            >
              ×
            </button>
          )}
        </span>
        <span className="bk-chip-as">{assigneeLabel(r)}</span>
      </span>
    );
  }

  // 現在の枠に存在しない予約（受付時間の変更前に入ったもの）
  const validKeys = new Set(
    PREOPEN_DAYS.flatMap((d) => d.rounds.map((r) => slotKey(d.date, r.start)))
  );
  const orphans = reservations.filter((r) => !validKeys.has(slotKey(r.reserve_date, r.start_time)));

  function add(date: string) {
    const start = slotSel[date] ?? "";
    const name = (nameDraft[date] ?? "").trim();
    if (!start) {
      setMsg({ ok: false, text: "予約枠を選択してください。" });
      return;
    }
    if (!name) {
      setMsg({ ok: false, text: "お客様の名前を入力してください。" });
      return;
    }
    startTransition(async () => {
      const res = await addReservation({
        date,
        start,
        customerName: name,
        free: (assign[date] ?? defaultAssign) === "free",
      });
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) {
        setNameDraft((d) => ({ ...d, [date]: "" }));
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
      <div className="section">
        <div className="section-head">
          <h2>モデル客の予約</h2>
          <span className="eyebrow">枠を選んで名前を入力</span>
        </div>
        <div className="section-body">
          {msg && (
            <p className={"liff-msg " + (msg.ok ? "ok" : "err")} style={{ marginTop: 0 }}>
              {msg.text}
            </p>
          )}

          {PREOPEN_DAYS.map((day) => {
            const openRounds = day.rounds.filter(
              (r) => (capacities[slotKey(day.date, r.start)] ?? 0) > 0
            );
            return (
              <div key={day.date} className="bk-day">
                {/* 日付＋空き状況（インライン） */}
                <div className="bk-head">
                  <span className="eyebrow" style={{ fontWeight: 700 }}>
                    {day.label}
                    {day.note && <span style={{ fontWeight: 400 }}>　{day.note}</span>}
                  </span>
                  <span className="bk-slots">
                    <span className="soft bk-slots-lbl" style={{ fontSize: 11.5 }}>
                      空き状況
                    </span>
                    {PREOPEN_ALL_STARTS.map((s) => {
                      const round = day.rounds.find((r) => r.start === s);
                      if (!round) {
                        return <span key={s} className="bk-slot empty" aria-hidden />;
                      }
                      const cap = capacities[slotKey(day.date, s)] ?? 0;
                      const used = usedCount(day.date, s);
                      const full = cap > 0 && used >= cap;
                      return (
                        <span key={s} className="bk-slot en">
                          {round.start}–{round.end}
                          <span className={"mk " + (cap === 0 || full ? "late" : "early")}>
                            {cap === 0 ? "—" : full ? "満" : `${used}/${cap}`}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                </div>

                {/* 予約行：枠を選択 → 名前 → 担当 → 予約 */}
                <div className="bk-row">
                  <select
                    className="input bk-sel-slot"
                    value={slotSel[day.date] ?? ""}
                    onChange={(e) => setSlotSel((s) => ({ ...s, [day.date]: e.target.value }))}
                    disabled={pending}
                  >
                    <option value="">予約枠</option>
                    {openRounds.map((r) => {
                      const cap = capacities[slotKey(day.date, r.start)] ?? 0;
                      const left = cap - usedCount(day.date, r.start);
                      return (
                        <option key={r.start} value={r.start} disabled={left <= 0}>
                          {r.start}–{r.end}（{left <= 0 ? "満席" : `残${left}`}）
                        </option>
                      );
                    })}
                  </select>
                  <input
                    className="input bk-sel-name"
                    placeholder={`${surname(meName)}さんのお客様の名前を入力`}
                    value={nameDraft[day.date] ?? ""}
                    onChange={(e) => setNameDraft((d) => ({ ...d, [day.date]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") add(day.date);
                    }}
                    disabled={pending}
                  />
                  <select
                    className="input bk-sel-assign"
                    value={assign[day.date] ?? defaultAssign}
                    onChange={(e) =>
                      setAssign((a) => ({ ...a, [day.date]: e.target.value as "self" | "free" }))
                    }
                    disabled={pending}
                  >
                    <option value="self">自分が施術する</option>
                    <option value="free">フリー（誰でも）</option>
                  </select>
                  <button
                    className="btn-outline bk-sel-go"
                    onClick={() => add(day.date)}
                    disabled={pending}
                    style={{ fontSize: 13 }}
                  >
                    予約
                  </button>
                </div>
              </div>
            );
          })}

          <p className="help" style={{ marginBottom: 0 }}>
            ※ 施術90分。受付数はプレオープン出勤表に連動。「フリー」は誰が施術してもよい予約です。
          </p>
        </div>
      </div>

      {/* 確定した予約一覧（カレンダー形式：日付×時間帯） */}
      <div className="section">
        <div className="section-head">
          <h2>予約一覧</h2>
          <span className="eyebrow">{reservations.length}件</span>
        </div>
        <div className="section-body" style={{ paddingTop: 10 }}>
          {/* PC：日付×時間帯の表 */}
          <div className="bk-cal-desktop" style={{ overflowX: "auto" }}>
            <table className="bk-cal">
              <thead>
                <tr>
                  <th>日付</th>
                  {PREOPEN_ALL_STARTS.map((s) => (
                    <th key={s} className="en">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PREOPEN_DAYS.map((day) => {
                  const startSet = new Set(day.rounds.map((r) => r.start));
                  return (
                    <tr key={day.date}>
                      <th className="bk-cal-day">{day.label}</th>
                      {PREOPEN_ALL_STARTS.map((s) => {
                        if (!startSet.has(s)) {
                          return (
                            <td key={s} className="bk-cal-na">
                              ·
                            </td>
                          );
                        }
                        const list = reservations.filter(
                          (r) => r.reserve_date === day.date && hm(r.start_time) === s
                        );
                        return (
                          <td key={s} className="bk-cal-cell">
                            <div className="bk-cal-chips">{list.map(chip)}</div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* スマホ：日付ごとに時間を縦並び */}
          <div className="bk-cal-mobile">
            {PREOPEN_DAYS.map((day) => (
              <div className="bk-m-day" key={day.date}>
                <div className="bk-m-dayhead">{day.label}</div>
                {day.rounds.map((r) => {
                  const list = slotReservations(day.date, r.start);
                  return (
                    <div className="bk-m-slot" key={r.start}>
                      <span className="bk-m-time en">{r.start}</span>
                      <div className="bk-m-names">
                        {list.length === 0 ? (
                          <span className="soft" style={{ fontSize: 12 }}>
                            —
                          </span>
                        ) : (
                          list.map(chip)
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {orphans.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="eyebrow" style={{ margin: "0 0 6px", fontWeight: 700 }}>
                要時間調整（受付時間の変更前に入った予約）
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
                        （{assigneeLabel(r)}）
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
            </div>
          )}

          <p className="help" style={{ marginBottom: 0 }}>
            セル内は「お客様名／担当」。×で削除（自分の予約のみ・オーナーは全件）。
          </p>
        </div>
      </div>
    </>
  );
}
