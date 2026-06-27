"use client";

import { useState } from "react";
import type { FcHqStaffRow } from "@/lib/fc-hq/report";

// コピーできる値セル。タップでクリップボードへコピーし、一瞬「コピー✓」を表示する。
function Copy({ value, className }: { value: string; className?: string }) {
  const [done, setDone] = useState(false);
  const text = value === "" ? "—" : value;
  return (
    <button
      type="button"
      className={"fc-copy" + (className ? " " + className : "")}
      title="クリップボードにコピー"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 900);
        } catch {
          /* clipboard 不可環境は無視 */
        }
      }}
    >
      <span className="fc-copy-val">{text}</span>
      <span className="fc-copy-ic">{done ? "✓" : "⧉"}</span>
    </button>
  );
}

// FC本部「勤務時間」「スタッフ管理」フォームへの転記支援テーブル。
// 各セルはタップでコピーでき、手入力を高速・正確にする。
export default function FcExportTable({ month, rows }: { month: string; rows: FcHqStaffRow[] }) {
  if (rows.length === 0) {
    return <p className="help" style={{ margin: 0 }}>この月の対象スタッフがいません。</p>;
  }
  return (
    <div className="fc-tables">
      {/* 勤務時間（月次） */}
      <div className="section" style={{ alignSelf: "start" }}>
        <div className="section-head">
          <h2>勤務時間</h2>
          <span className="eyebrow">Work Hours</span>
        </div>
        <div className="section-body" style={{ paddingTop: 18 }}>
          <p className="help" style={{ marginTop: 0, marginBottom: 16 }}>
            本部「勤務時間」フォーム（年月 {month}）。各セルをタップでコピーできます。遅刻欠勤は本部側でご確認ください。
          </p>
          <div className="fc-table-wrap">
            <table className="staff-table fc-table">
              <thead>
                <tr>
                  <th>氏名</th>
                  <th style={{ textAlign: "right" }}>勤務時間(h)</th>
                  <th style={{ textAlign: "right" }}>勤務日数</th>
                  <th style={{ textAlign: "center" }}>遅刻欠勤</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td><Copy value={r.name} /></td>
                    <td style={{ textAlign: "right" }}>
                      <Copy value={String(r.monthly_hours)} className="en" />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Copy value={String(r.worked_days)} className="en" />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="muted">{r.late_absence}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* スタッフ管理 */}
      <div className="section" style={{ alignSelf: "start" }}>
        <div className="section-head">
          <h2>スタッフ管理</h2>
          <span className="eyebrow">Staff</span>
        </div>
        <div className="section-body" style={{ paddingTop: 18 }}>
          <p className="help" style={{ marginTop: 0, marginBottom: 16 }}>
            本部「スタッフ管理」フォーム。カナ氏名・在籍状況はスタッフ詳細で編集できます。
          </p>
          <div className="fc-table-wrap">
            <table className="staff-table fc-table">
              <thead>
                <tr>
                  <th>カナ氏名</th>
                  <th>氏名</th>
                  <th>在籍状況</th>
                  <th>雇用形態</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td><Copy value={r.name_kana} /></td>
                    <td><Copy value={r.name} /></td>
                    <td>
                      <span className={"fc-status fc-st-" + r.work_status}>{r.work_status_label}</span>
                    </td>
                    <td><span className="muted">{r.employment_type_label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
