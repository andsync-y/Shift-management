"use client";

import { useActionState, useState } from "react";
import { submitTimeOff } from "./actions";

// 「終日休み」チェックで 休み(off) / 時間変更(time_change) を自動判別する。
export default function TimeOffForm() {
  const [state, formAction, pending] = useActionState(submitTimeOff, null);
  const [allDay, setAllDay] = useState(true);
  const [dates, setDates] = useState<string[]>([]);
  const [draft, setDraft] = useState("");

  const reqType = allDay ? "off" : "time_change";
  const kind = allDay ? "休み" : "時間変更";

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
        <p className="help" style={{ marginTop: 0, marginBottom: 24 }}>
          「終日休み」をオンにすると<b className="soft">休み</b>、オフにすると勤務時間を指定する
          <b className="soft">時間変更</b>として申請されます。対象日は複数追加できます。
        </p>

        <form action={formAction}>
          <input type="hidden" name="off_dates" value={dates.join(",")} />
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
            <label className="check">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              <span>終日休み</span>
            </label>
          </div>

          {!allDay && (
            <div className="to-times">
              <div className="field">
                <label>
                  Start <span className="jp-label">／ 希望開始時刻 ＊</span>
                </label>
                <input className="input" name="start_time" type="time" defaultValue="10:00" />
              </div>
              <div className="field">
                <label>
                  End <span className="jp-label">／ 希望終了時刻 ＊</span>
                </label>
                <input className="input" name="end_time" type="time" defaultValue="19:00" />
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
                    <span className={`mk ${allDay ? "early" : "late"}`}>{allDay ? "終日" : "時間変更"}</span>
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

          <div style={{ marginTop: 26 }}>
            <button type="submit" className="btn-fill" disabled={pending || dates.length === 0}>
              {pending ? "申請中..." : allDay ? "お休みを申請" : "時間変更を申請"}
              {dates.length > 0 ? `（${dates.length}日）` : ""}
            </button>
            {dates.length === 0 && (
              <span className="help" style={{ marginLeft: 16 }}>
                対象日を1日以上追加してください。
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
