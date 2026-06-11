"use client";

import { useActionState, useState } from "react";
import { submitTimeOff } from "./actions";

// 「終日休み」チェックで 休み(off) / 時間変更(time_change) を自動判別する。
export default function TimeOffForm() {
  const [state, formAction, pending] = useActionState(submitTimeOff, null);
  const [allDay, setAllDay] = useState(true);
  const [dates, setDates] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("19:00");

  const reqType = allDay ? "off" : "time_change";
  const kind = allDay ? "休み" : "時間変更";

  // 入力欄に有効な日付が入っていれば「追加」を押し忘れても対象日に含める。
  const draftValid = /^\d{4}-\d{2}-\d{2}$/.test(draft) && !dates.includes(draft);
  const effectiveDates = draftValid ? [...dates, draft].sort() : dates;

  function addDate() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft)) return;
    if (!dates.includes(draft)) setDates((prev) => [...prev, draft].sort());
    setDraft("");
  }
  function removeDate(d: string) {
    setDates((prev) => prev.filter((x) => x !== d));
  }

  return (
    <div className="section">
      <div className="section-head">
        <h2>新規申請</h2>
        <span
          className={`status-pill ${allDay ? "wait" : "no"}`}
          style={
            allDay
              ? {
                  color: "#1A3CC4",
                  background: "color-mix(in oklab,#1A3CC4 7%,transparent)",
                  borderColor: "color-mix(in oklab,#1A3CC4 26%,transparent)",
                }
              : {
                  color: "#94560E",
                  background: "color-mix(in oklab,#94560E 7%,transparent)",
                  borderColor: "color-mix(in oklab,#94560E 26%,transparent)",
                }
          }
        >
          区分：{kind}
        </span>
      </div>

      <div className="section-body">
        {/* 申請の種類を最初にはっきり選ばせる（あいまいな組み合わせを無くす） */}
        <div className="field" style={{ marginTop: 0, marginBottom: 20 }}>
          <label>
            Type <span className="jp-label">／ 申請の種類 ＊</span>
          </label>
          <div className="seg" role="tablist" style={{ display: "inline-flex" }}>
            <button
              type="button"
              className={allDay ? "on" : ""}
              onClick={() => setAllDay(true)}
            >
              終日休み（1日まるごと）
            </button>
            <button
              type="button"
              className={!allDay ? "on" : ""}
              onClick={() => setAllDay(false)}
            >
              時間変更（勤務時間を変える）
            </button>
          </div>
        </div>

        <p className="help" style={{ marginTop: 0, marginBottom: 24 }}>
          {allDay
            ? "選んだ日を「終日休み」として申請します。勤務時間の入力はありません。"
            : "選んだ日について、希望する新しい勤務時間を指定して申請します。"}
          対象日は複数追加できます。
        </p>

        <form action={formAction}>
          <input type="hidden" name="off_dates" value={effectiveDates.join(",")} />
          <input type="hidden" name="request_type" value={reqType} />
          {allDay && <input type="hidden" name="all_day" value="on" />}

          <div className="add-row" style={{ alignItems: "flex-end" }}>
            <div className="field grow" style={{ minWidth: 260 }}>
              <label>
                Dates <span className="jp-label">／ 対象日 ＊（複数追加できます）</span>
              </label>
              <input
                className="input"
                type="date"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </div>
            <button type="button" className="btn-outline" style={{ padding: "12px 22px" }} onClick={addDate}>
              追加
            </button>
          </div>

          {!allDay && (
            <div className="to-times">
              <div className="field">
                <label>
                  Start <span className="jp-label">／ 希望開始時刻 ＊</span>
                </label>
                <input
                  className="input"
                  name="start_time"
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="field">
                <label>
                  End <span className="jp-label">／ 希望終了時刻 ＊</span>
                </label>
                <input
                  className="input"
                  name="end_time"
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>
          )}

          {dates.length > 0 && (
            <div className="date-chips">
              {dates.map((d) => {
                const [, m, day] = d.split("-");
                return (
                  <span className="achip" key={d}>
                    <span className="atm en">
                      {Number(m)}/{Number(day)}
                    </span>
                    <span className={`mk ${allDay ? "early" : "late"}`}>{allDay ? "終日" : `${start}–${end}`}</span>
                    <button type="button" className="ax" onClick={() => removeDate(d)} aria-label="削除">
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <div className="field" style={{ marginTop: 26, maxWidth: 640 }}>
            <label>
              Reason <span className="jp-label">／ 理由（任意）</span>
            </label>
            <input className="input" name="reason" placeholder={allDay ? "私用 など" : "通院のため など"} />
          </div>

          {!allDay && (
            <p className="help" style={{ marginTop: 16, marginBottom: 0 }}>
              ※ 時間変更は「希望する新しい勤務時間」を入力してください。承認されるとカレンダーに変更希望として表示されます。
            </p>
          )}

          {state && (
            <p
              className="help"
              style={{ marginTop: 18, marginBottom: 0, color: state.ok ? "#3d6b4f" : "#9a3a30", fontSize: 13 }}
            >
              {state.message}
            </p>
          )}

          {/* 送信前の確認プレビュー：間違った申請を防ぐ */}
          {effectiveDates.length > 0 && (
            <div
              className="alert-banner ok"
              style={{ marginTop: 26, alignItems: "center" }}
            >
              <span className="ab-icon">✓</span>
              <div>
                <p className="ab-title" style={{ marginBottom: 4 }}>
                  この内容で申請します
                </p>
                <p className="help" style={{ margin: 0 }}>
                  {effectiveDates
                    .map((d) => {
                      const [, m, day] = d.split("-");
                      return `${Number(m)}/${Number(day)}`;
                    })
                    .join("・")}{" "}
                  を{" "}
                  <b className="soft">{allDay ? "終日休み" : `${start}–${end} への時間変更`}</b>{" "}
                  として申請（{effectiveDates.length}日）
                </p>
              </div>
            </div>
          )}

          <div style={{ marginTop: 22 }}>
            <button type="submit" className="btn-fill" disabled={pending || effectiveDates.length === 0}>
              {pending ? "申請中..." : allDay ? "お休みを申請" : "時間変更を申請"}
              {effectiveDates.length > 0 ? `（${effectiveDates.length}日）` : ""}
            </button>
            {effectiveDates.length === 0 && (
              <span className="help" style={{ marginLeft: 16 }}>
                対象日を入力してください（複数日は「追加」で増やせます）。
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
