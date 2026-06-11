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
  // 日付ごとの入力状態（枠・名前・担当区分）
  const [slotSel, setSlotSel] = useState<Record<string, string>>({});
  const [nameDraft, setNameDraft] = useState<Record<string, string>>({});
  const [assign, setAssign] = useState<Record<string, "self" | "free">>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const staffMap = new Map(staff.map((s) => [s.id, s]));
  const defaultAssign: "self" | "free" = isAdmin ? "free" : "self";

  function usedCount(date: string, start: string) {
    return reservations.filter((r) => r.reserve_date === date && hm(r.start_time) === start).length;
  }
  // 担当表示：フリー予約は「フリー」、それ以外は登録者の姓（旧データはオーナー登録＝フリー扱い）
  function assigneeLabel(r: PreopenReservation) {
    const p = staffMap.get(r.staff_id);
    const free = r.is_free || p?.role === "super_admin";
    return free ? "フリー" : surname(p?.full_name ?? "?");
  }

  // 現在の枠に存在しない予約（受付時間の変更前に入ったもの）
  const validKeys = new Set(
    PREOPEN_DAYS.flatMap((d) => d.rounds.map((r) => slotKey(d.date, r.start)))
  );

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
                    <span className="soft" style={{ fontSize: 11.5, marginRight: 2 }}>
                      空き状況
                    </span>
                    {day.rounds.map((r) => {
                      const cap = capacities[slotKey(day.date, r.start)] ?? 0;
                      const used = usedCount(day.date, r.start);
                      const full = cap > 0 && used >= cap;
                      return (
                        <span key={r.start} className="bk-slot en">
                          {r.start}–{r.end}
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
                    className="input"
                    value={slotSel[day.date] ?? ""}
                    onChange={(e) => setSlotSel((s) => ({ ...s, [day.date]: e.target.value }))}
                    disabled={pending}
                    style={{ width: "auto", minWidth: 150 }}
                  >
                    <option value="">予約枠 ▽</option>
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
                    className="input"
                    placeholder={`${surname(meName)}さんのお客様の名前を入力`}
                    value={nameDraft[day.date] ?? ""}
                    onChange={(e) => setNameDraft((d) => ({ ...d, [day.date]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") add(day.date);
                    }}
                    disabled={pending}
                    style={{ flex: 1, minWidth: 160 }}
                  />
                  <select
                    className="input"
                    value={assign[day.date] ?? defaultAssign}
                    onChange={(e) =>
                      setAssign((a) => ({ ...a, [day.date]: e.target.value as "self" | "free" }))
                    }
                    disabled={pending}
                    style={{ width: "auto" }}
                  >
                    <option value="self">自分が施術する</option>
                    <option value="free">フリー（誰でも）</option>
                  </select>
                  <button
                    className="btn-outline"
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

      {/* 確定した予約一覧 */}
      <div className="section">
        <div className="section-head">
          <h2>予約一覧</h2>
          <span className="eyebrow">{reservations.length}件</span>
        </div>
        <div className="section-body" style={{ overflowX: "auto", paddingTop: 10 }}>
          {reservations.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>
              まだ予約はありません。
            </p>
          ) : (
            <table className="staff-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ whiteSpace: "nowrap" }}>日時</th>
                  <th>お客様</th>
                  <th style={{ whiteSpace: "nowrap" }}>担当</th>
                  <th style={{ whiteSpace: "nowrap" }}>登録</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => {
                  const canDelete = r.staff_id === meId || isAdmin;
                  const orphan = !validKeys.has(slotKey(r.reserve_date, r.start_time));
                  return (
                    <tr key={r.id}>
                      <td className="en" style={{ whiteSpace: "nowrap" }}>
                        {r.reserve_date.slice(5).replace("-", "/")} {hm(r.start_time)}–{hm(r.end_time)}
                        {orphan && (
                          <span className="mk late" style={{ marginLeft: 6 }}>
                            要時間調整
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{r.customer_name}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{assigneeLabel(r)}</td>
                      <td className="soft" style={{ whiteSpace: "nowrap" }}>
                        {surname(staffMap.get(r.staff_id)?.full_name ?? "?")}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {canDelete && (
                          <button
                            onClick={() => remove(r.id)}
                            disabled={pending}
                            style={{
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="help" style={{ marginBottom: 0 }}>
            「要時間調整」は受付時間の変更前に入った予約。お客様と調整のうえ削除→入れ直してください。
            削除は自分の予約のみ（オーナーは全件）。
          </p>
        </div>
      </div>
    </>
  );
}
