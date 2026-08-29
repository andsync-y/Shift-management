"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { deleteAbsence, recordAbsence } from "./actions";
import {
  ABSENCE_KINDS,
  ABSENCE_KIND_LABELS_JA,
  tallyAbsences,
  filterByMonth,
  absenceRate,
  type Absence,
} from "@/lib/absences";

type Staff = { id: string; full_name: string; display_name: string | null };

const name = (s?: Staff) => s?.display_name || s?.full_name || "—";
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export default function AbsenceManager({
  staff,
  absences,
  month,
  scheduledDays,
}: {
  staff: Staff[];
  absences: Absence[];
  month: string;
  /** 対象月のスタッフ別シフト日数（欠勤率の分母） */
  scheduledDays: Record<string, number>;
}) {
  const [state, formAction, pending] = useActionState(recordAbsence, null);
  const [kind, setKind] = useState("absent");
  const [deleting, startDelete] = useTransition();

  const monthRows = useMemo(() => filterByMonth(absences, month), [absences, month]);
  const tally = useMemo(() => tallyAbsences(monthRows), [monthRows]);
  const byId = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  // 件数の多い順。0件の人も表示して「誰が休んでいないか」も見えるようにする。
  const rows = staff
    .map((s) => ({ s, t: tally.get(s.id), days: scheduledDays[s.id] ?? 0 }))
    .sort((a, b) => (b.t?.total ?? 0) - (a.t?.total ?? 0));
  const totalAbs = monthRows.filter((r) => r.kind === "absent" || r.kind === "no_show").length;

  return (
    <>
      {/* サマリ：1画面で誰がどれだけ休んだか分かるように上に置く */}
      <div className="section">
        <div className="section-head">
          <h2>スタッフ別（{Number(month.slice(5, 7))}月）</h2>
          <span className="eyebrow">欠勤 計{totalAbs}件</span>
        </div>
        <div className="section-body" style={{ overflowX: "auto", paddingTop: 10 }}>
          <table className="staff-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>スタッフ</th>
                {ABSENCE_KINDS.map((k) => (
                  <th key={k} style={{ textAlign: "right" }}>
                    {ABSENCE_KIND_LABELS_JA[k]}
                  </th>
                ))}
                <th style={{ textAlign: "right" }}>出勤予定</th>
                <th style={{ textAlign: "right" }}>欠勤率</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, t, days }) => {
                const abs = t?.absences ?? 0;
                const rate = absenceRate(abs, days);
                return (
                  <tr key={s.id}>
                    <td>{name(s)}</td>
                    {ABSENCE_KINDS.map((k) => (
                      <td key={k} className="en" style={{ textAlign: "right" }}>
                        {t?.byKind[k] ? t.byKind[k] : <span className="muted">—</span>}
                      </td>
                    ))}
                    <td className="en" style={{ textAlign: "right" }}>{days || <span className="muted">—</span>}</td>
                    <td
                      className="en"
                      style={{ textAlign: "right", color: rate >= 0.1 ? "#9a3a30" : undefined }}
                    >
                      {days ? `${(rate * 100).toFixed(1)}%` : <span className="muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="help" style={{ marginBottom: 0, marginTop: 10 }}>
            <strong>欠勤率＝（欠勤＋無断欠勤）÷ その月のシフト日数</strong>。遅刻・早退は出勤しているので欠勤数には含めません。
            賃金は実打刻ベースなので、休んだ分は給与計算に自動で反映されます（ここでの登録は給与を変えません）。
          </p>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>記録する</h2>
        </div>
        <div className="section-body">
          <form action={formAction}>
            <div className="profile-cols">
              <div className="field">
                <label>スタッフ</label>
                <select name="staff_id" className="select" required defaultValue="">
                  <option value="" disabled>
                    選択してください
                  </option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {name(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>日付</label>
                <input name="absence_date" type="date" className="input en" required />
              </div>
              <div className="field">
                <label>区分</label>
                <select
                  name="kind"
                  className="select"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  {ABSENCE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ABSENCE_KIND_LABELS_JA[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>連絡を受けた日時</label>
                <input
                  name="reported_at"
                  type="datetime-local"
                  className="input en"
                  disabled={kind === "no_show"}
                />
                <p className="help" style={{ margin: "4px 0 0" }}>
                  {kind === "no_show"
                    ? "無断欠勤は「連絡が無かった」ことが記録なので空欄になります。"
                    : "LINEが来た日時。当日の朝か前日かで意味が変わるので入れておくと後で効きます。"}
                </p>
              </div>
              <div className="field">
                <label>理由（本人の申し出）</label>
                <input name="reason" type="text" className="input" placeholder="例: 発熱" maxLength={200} />
              </div>
              <div className="field">
                <label>補足</label>
                <input name="note" type="text" className="input" placeholder="例: 遅番をDAYANが代替" maxLength={500} />
              </div>
            </div>
            <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 16 }}>
              <button type="submit" className="btn-fill" disabled={pending}>
                {pending ? "保存中…" : "記録する"}
              </button>
              {state && (
                <span className="help" style={{ margin: 0, color: state.ok ? "#3d6b4f" : "#9a3a30" }}>
                  {state.message}
                </span>
              )}
              <span className="help" style={{ margin: 0 }}>
                同じ日・同じ区分をもう一度入れると上書きされます（二重に増えません）。
              </span>
            </div>
          </form>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>記録一覧</h2>
          <span className="eyebrow">直近{absences.length}件</span>
        </div>
        <div className="section-body" style={{ overflowX: "auto", paddingTop: 10 }}>
          {absences.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>まだ記録がありません。</p>
          ) : (
            <table className="staff-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>日付</th>
                  <th>スタッフ</th>
                  <th>区分</th>
                  <th>理由</th>
                  <th>連絡</th>
                  <th>補足</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {absences.map((a) => (
                  <tr key={a.id}>
                    <td className="en">{md(a.absence_date)}</td>
                    <td>{name(byId.get(a.staff_id))}</td>
                    <td>
                      <span style={{ color: a.kind === "no_show" ? "#9a3a30" : undefined }}>
                        {ABSENCE_KIND_LABELS_JA[a.kind]}
                      </span>
                    </td>
                    <td>{a.reason || <span className="muted">—</span>}</td>
                    <td className="en">
                      {a.reported_at ? (
                        new Date(a.reported_at).toLocaleString("ja-JP", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      ) : (
                        <span className="muted">なし</span>
                      )}
                    </td>
                    <td>{a.note || <span className="muted">—</span>}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn-outline"
                        style={{ fontSize: 11.5, padding: "3px 9px" }}
                        disabled={deleting}
                        onClick={() => {
                          if (!confirm(`${md(a.absence_date)} ${name(byId.get(a.staff_id))} の記録を削除しますか？`)) return;
                          startDelete(async () => {
                            await deleteAbsence(a.id);
                          });
                        }}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
