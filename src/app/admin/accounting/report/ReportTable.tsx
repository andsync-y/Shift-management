"use client";

import { ACCOUNTS } from "@/lib/accounting/accounts";

export interface AccountMonthRow {
  month: string; // "YYYY-MM"
  account: string;
  total: number;
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;

export default function ReportTable({ rows, year }: { rows: AccountMonthRow[]; year: number }) {
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

  // 科目 → 月(MM) → 合計
  const map = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const mm = r.month.slice(5, 7);
    if (!map.has(r.account)) map.set(r.account, new Map());
    map.get(r.account)!.set(mm, (map.get(r.account)!.get(mm) ?? 0) + r.total);
  }
  // 科目の並び：定義順 → それ以外（未分類など）を後ろに
  const present = [...map.keys()];
  const ordered = [
    ...ACCOUNTS.filter((a) => map.has(a)),
    ...present.filter((a) => !ACCOUNTS.includes(a as (typeof ACCOUNTS)[number])),
  ];

  const accountTotal = (a: string) => months.reduce((s, m) => s + (map.get(a)?.get(m) ?? 0), 0);
  const monthTotal = (m: string) => ordered.reduce((s, a) => s + (map.get(a)?.get(m) ?? 0), 0);
  const grand = ordered.reduce((s, a) => s + accountTotal(a), 0);

  function exportCsv() {
    const header = ["勘定科目", ...months.map((m) => `${Number(m)}月`), "年計"];
    const lines = ordered.map((a) => [
      a,
      ...months.map((m) => String(Math.round(map.get(a)?.get(m) ?? 0))),
      String(Math.round(accountTotal(a))),
    ]);
    const totalRow = ["合計", ...months.map((m) => String(Math.round(monthTotal(m)))), String(Math.round(grand))];
    const csv = [header, ...lines, totalRow]
      .map((row) => row.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expense_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="section">
      <div className="section-head">
        <h2>科目別 月次集計</h2>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn-outline" style={{ fontSize: 12, padding: "6px 12px" }} onClick={exportCsv}>
            CSV出力
          </button>
          <span className="eyebrow">年計 {yen(grand)}</span>
        </span>
      </div>
      <div className="section-body" style={{ overflowX: "auto", paddingTop: 10 }}>
        {ordered.length === 0 ? (
          <p className="help" style={{ margin: 0 }}>
            この年の経費データがありません。「カード明細」を取り込み、勘定科目を設定すると集計されます。
          </p>
        ) : (
          <table className="staff-table" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ whiteSpace: "nowrap" }}>勘定科目</th>
                {months.map((m) => (
                  <th key={m} style={{ textAlign: "right" }}>{Number(m)}月</th>
                ))}
                <th style={{ textAlign: "right" }}>年計</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((a) => (
                <tr key={a}>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{a}</td>
                  {months.map((m) => {
                    const v = map.get(a)?.get(m) ?? 0;
                    return (
                      <td key={m} className="en" style={{ textAlign: "right", color: v ? undefined : "var(--line)" }}>
                        {v ? Math.round(v).toLocaleString() : "—"}
                      </td>
                    );
                  })}
                  <td className="en" style={{ textAlign: "right", fontWeight: 700 }}>{yen(accountTotal(a))}</td>
                </tr>
              ))}
              <tr>
                <td style={{ fontWeight: 700 }}>合計</td>
                {months.map((m) => (
                  <td key={m} className="en" style={{ textAlign: "right", fontWeight: 600 }}>
                    {monthTotal(m) ? Math.round(monthTotal(m)).toLocaleString() : "—"}
                  </td>
                ))}
                <td className="en" style={{ textAlign: "right", fontWeight: 700 }}>{yen(grand)}</td>
              </tr>
            </tbody>
          </table>
        )}
        <p className="help" style={{ marginBottom: 0 }}>
          経費（カード明細）を勘定科目別に集計。未設定は「未分類」。CSVは確定申告ソフトや税理士共有に。
        </p>
      </div>
    </div>
  );
}
