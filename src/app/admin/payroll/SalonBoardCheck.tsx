"use client";

import { useRef, useState, useTransition } from "react";
import { applySalonBoard, compareSalonBoard, type SalonBoardDiffRow } from "./actions";

// サロンボードの会計CSVと、いまアプリに入っている指名数・回数券本数を突き合わせる。
//
// 給与のバックは本部システムの担当別売上＝スタッフの手入力から取り込んでいる。
// サロンボードは実際の会計そのものなので、給与を締める前にここで確認する。
// バック合計は月¥19万規模になるため、手入力の誤りはそのまま金銭の誤りになる。
//
// サロンボードのCSVは Shift_JIS。UTF-8で厳密デコードして失敗したら Shift_JIS とみなす。
async function readCsv(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("shift_jis").decode(buf);
  }
}

const yen = (n: number) => `${n >= 0 ? "+" : "−"}¥${Math.abs(n).toLocaleString()}`;

export default function SalonBoardCheck({ month }: { month: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rows, setRows] = useState<SalonBoardDiffRow[] | null>(null);
  const [csv, setCsv] = useState<string>("");
  const [totalDiff, setTotalDiff] = useState(0);

  const diffRows = (rows ?? []).filter((r) => r.backDiff !== 0 || !r.matched);

  return (
    <div style={{ width: "100%" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input
          ref={ref}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setMsg(null);
            setRows(null);
            start(async () => {
              try {
                const text = await readCsv(file);
                setCsv(text);
                const r = await compareSalonBoard(month, text);
                setMsg({ ok: r.ok, text: r.message });
                setRows(r.rows ?? null);
                setTotalDiff(r.totalBackDiff ?? 0);
              } catch (err) {
                setMsg({ ok: false, text: err instanceof Error ? err.message : "突合に失敗しました。" });
              }
            });
          }}
        />
        <button
          type="button"
          className="btn-outline"
          style={{ fontSize: 12.5, padding: "7px 12px" }}
          disabled={pending}
          onClick={() => ref.current?.click()}
        >
          {pending ? "突合中…" : "🧾 サロンボードCSVと突合"}
        </button>
        {msg && (
          <span className="help" style={{ margin: 0, color: msg.ok && diffRows.length === 0 ? "#3d6b4f" : "#9a3a30" }}>
            {msg.text}
          </span>
        )}
      </span>

      {rows && diffRows.length > 0 && (
        <div style={{ marginTop: 10, overflowX: "auto" }}>
          <table className="staff-table" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th>担当</th>
                <th style={{ textAlign: "right" }}>指名 SB/現在</th>
                <th style={{ textAlign: "right" }}>回数券 SB/現在</th>
                <th style={{ textAlign: "right" }}>バック差額</th>
              </tr>
            </thead>
            <tbody>
              {diffRows.map((r) => (
                <tr key={r.staff}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.staff}
                    {!r.matched && (
                      <span className="mk late" style={{ marginLeft: 6 }} title="アプリのスタッフと名前が一致しません">
                        未一致
                      </span>
                    )}
                  </td>
                  <td className="en" style={{ textAlign: "right" }}>
                    {r.salonNomination} / {r.storedNomination}
                  </td>
                  <td className="en" style={{ textAlign: "right" }}>
                    {r.salonKaisuken} / {r.storedKaisuken}
                  </td>
                  <td className="en" style={{ textAlign: "right", color: r.backDiff !== 0 ? "#9a3a30" : undefined }}>
                    {r.backDiff === 0 ? "—" : yen(r.backDiff)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-fill"
              style={{ fontSize: 12.5, padding: "7px 14px" }}
              disabled={pending}
              onClick={() => {
                if (!confirm(`サロンボードの数字で上書きします。バックが ${yen(totalDiff)} 変わります。よろしいですか？`)) return;
                start(async () => {
                  const r = await applySalonBoard(month, csv);
                  setMsg({ ok: r.ok, text: r.message });
                  if (r.ok) setRows(null);
                });
              }}
            >
              サロンボードの数字で上書き
            </button>
            <span className="help" style={{ margin: 0 }}>
              <strong>SB＝サロンボード（実際の会計）／現在＝この表に入っている値（本部システムの手入力）。</strong>
              サロンボードが正なので、差異があれば上書きしてください。バック差額の合計は {yen(totalDiff)}（＋は支給不足）。
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
