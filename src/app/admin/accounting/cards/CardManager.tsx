"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCardTransaction, insertCardTransactions, updateCardAccount } from "../actions";
import { ACCOUNTS } from "@/lib/accounting/accounts";

export interface CardRow {
  id: string;
  transaction_date: string;
  amount: number;
  merchant_name: string | null;
  account: string | null;
  matched: { merchant: string | null; amount: number | null } | null;
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;

// --- CSVパース（クォート対応の簡易版） ---
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    if (row.some((x) => x.trim() !== "")) rows.push(row);
  }
  return rows;
}

function normDate(v: string): string | null {
  const s = v.trim().replace(/[年月]/g, "/").replace(/日/g, "").replace(/\./g, "/").replace(/-/g, "/");
  const m = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
function normAmount(v: string, absolute: boolean): number | null {
  const s = v.replace(/[¥￥,，\s円]/g, "").replace(/[０-９．－]/g, (c) =>
    "０１２３４５６７８９．－".indexOf(c) >= 0 ? "0123456789.-"["０１２３４５６７８９．－".indexOf(c)] : c
  );
  if (s === "" || s === "-") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return absolute ? Math.abs(n) : n;
}

export default function CardManager({ rows }: { rows: CardRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [grid, setGrid] = useState<string[][] | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [dateCol, setDateCol] = useState(0);
  const [amountCol, setAmountCol] = useState(1);
  const [merchantCol, setMerchantCol] = useState(2);
  const [absolute, setAbsolute] = useState(true);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(null);
    file.arrayBuffer().then((buf) => {
      const bytes = new Uint8Array(buf);
      // UTF-8で読み、文字化け(置換文字)が多ければ Shift_JIS で読み直す
      let text = new TextDecoder("utf-8").decode(bytes);
      const bad = (text.match(/�/g) || []).length;
      if (bad > 2) {
        try {
          text = new TextDecoder("shift_jis").decode(bytes);
        } catch {
          /* shift_jis 非対応環境はそのまま */
        }
      }
      const g = parseCsv(text);
      if (g.length === 0) {
        setMsg({ ok: false, text: "CSVを読み取れませんでした。" });
        return;
      }
      setGrid(g);
    });
    e.target.value = "";
  }

  const header = grid?.[0] ?? [];
  const dataRows = useMemo(() => (grid ? (hasHeader ? grid.slice(1) : grid) : []), [grid, hasHeader]);

  // 実データから日付/金額/店名の列を推定（見出しが無い/当てにならないCSVでも当たる）
  useEffect(() => {
    if (!grid || dataRows.length === 0) return;
    const cols = Math.max(...grid.map((r) => r.length), 0);
    const sample = dataRows.slice(0, 40);
    const dScore: number[] = [];
    const aScore: number[] = [];
    const tScore: number[] = [];
    for (let c = 0; c < cols; c++) {
      let d = 0, a = 0, t = 0, n = 0;
      for (const r of sample) {
        const v = (r[c] ?? "").trim();
        if (!v) continue;
        n++;
        const isDate = !!normDate(v);
        const isAmt = normAmount(v, true) != null;
        if (isDate) d++;
        if (isAmt) a++;
        if (!isDate && !isAmt) t++;
      }
      dScore[c] = n ? d / n : 0;
      aScore[c] = n ? a / n : 0;
      tScore[c] = n ? t / n : 0;
    }
    const argmax = (arr: number[], exclude: number[] = []) => {
      let best = -1, idx = 0;
      for (let c = 0; c < arr.length; c++) {
        if (exclude.includes(c)) continue;
        if (arr[c] > best) {
          best = arr[c];
          idx = c;
        }
      }
      return idx;
    };
    const d = argmax(dScore);
    const a = argmax(aScore, [d]);
    const m = argmax(tScore, [d, a]);
    setDateCol(d);
    setAmountCol(a);
    setMerchantCol(m);
    // grid / hasHeader が変わったときだけ推定（手動変更は保持）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, hasHeader]);

  const parsed = useMemo(
    () =>
      dataRows.map((r) => ({
        transaction_date: normDate(r[dateCol] ?? ""),
        amount: normAmount(r[amountCol] ?? "", absolute),
        merchant_name: (r[merchantCol] ?? "").trim() || null,
      })),
    [dataRows, dateCol, amountCol, merchantCol, absolute]
  );
  const okRows = parsed.filter((p) => p.transaction_date && p.amount != null) as {
    transaction_date: string;
    amount: number;
    merchant_name: string | null;
  }[];
  const ngCount = parsed.length - okRows.length;

  function doImport() {
    if (okRows.length === 0) return;
    start(async () => {
      const res = await insertCardTransactions(okRows);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) {
        setGrid(null);
        router.refresh();
      }
    });
  }
  function remove(id: string) {
    if (!confirm("この明細を削除しますか？")) return;
    start(async () => {
      const res = await deleteCardTransaction(id);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });
  }
  function saveAccount(id: string, account: string) {
    start(async () => {
      const res = await updateCardAccount(id, account);
      if (!res.ok) setMsg({ ok: false, text: res.message });
      else router.refresh();
    });
  }

  // 各列の選択肢ラベルに「実データの例」を添える（見出しが当てにならないCSV対策）
  const colCount = grid ? Math.max(...grid.map((r) => r.length), 0) : 0;
  const sampleRow = dataRows[0] ?? [];
  const colOptions = Array.from({ length: colCount }, (_, i) => {
    const ex = (sampleRow[i] ?? "").toString().trim().slice(0, 14);
    return { i, label: `${i + 1}列目${ex ? `（例: ${ex}）` : ""}` };
  });

  return (
    <>
      <div className="section">
        <div className="section-head">
          <h2>CSVを取り込む</h2>
          <span className="eyebrow">どのカード会社でもOK</span>
        </div>
        <div className="section-body">
          <label className="btn-fill" style={{ cursor: "pointer", display: "inline-block" }}>
            CSVを選ぶ
            <input type="file" accept=".csv,text/csv" hidden onChange={onFile} disabled={pending} />
          </label>
          {msg && (
            <p className="help" style={{ marginTop: 12, marginBottom: 0, color: msg.ok ? "#3d6b4f" : "#9a3a30" }}>
              {msg.text}
            </p>
          )}

          {grid && (
            <div style={{ marginTop: 16 }}>
              <div className="bk-row" style={{ marginBottom: 12, alignItems: "center" }}>
                <label className="po-edit-train">
                  <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
                  1行目は見出し
                </label>
                <span className="field" style={{ margin: 0 }}>
                  <label>日付の列</label>
                  <select className="input" value={dateCol} onChange={(e) => setDateCol(Number(e.target.value))}>
                    {colOptions.map((o) => (
                      <option key={o.i} value={o.i}>{o.label}</option>
                    ))}
                  </select>
                </span>
                <span className="field" style={{ margin: 0 }}>
                  <label>金額の列</label>
                  <select className="input" value={amountCol} onChange={(e) => setAmountCol(Number(e.target.value))}>
                    {colOptions.map((o) => (
                      <option key={o.i} value={o.i}>{o.label}</option>
                    ))}
                  </select>
                </span>
                <span className="field" style={{ margin: 0 }}>
                  <label>店名の列</label>
                  <select className="input" value={merchantCol} onChange={(e) => setMerchantCol(Number(e.target.value))}>
                    {colOptions.map((o) => (
                      <option key={o.i} value={o.i}>{o.label}</option>
                    ))}
                  </select>
                </span>
                <label className="po-edit-train">
                  <input type="checkbox" checked={absolute} onChange={(e) => setAbsolute(e.target.checked)} />
                  金額は絶対値（マイナス記号を無視）
                </label>
              </div>

              <p className="help" style={{ marginTop: 0 }}>
                プレビュー（{okRows.length}件取込可能{ngCount > 0 ? ` / ${ngCount}件は日付・金額が読めず除外` : ""}）
              </p>
              <div style={{ overflowX: "auto" }}>
                <table className="staff-table" style={{ fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th>日付</th>
                      <th style={{ textAlign: "right" }}>金額</th>
                      <th>店名</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 12).map((p, i) => (
                      <tr key={i} style={p.transaction_date && p.amount != null ? undefined : { opacity: 0.45 }}>
                        <td className="en">{p.transaction_date ?? "—"}</td>
                        <td className="en" style={{ textAlign: "right" }}>{p.amount != null ? yen(p.amount) : "—"}</td>
                        <td>{p.merchant_name ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 12 }}>
                <button className="btn-fill" onClick={doImport} disabled={pending || okRows.length === 0}>
                  {pending ? "取込中…" : `${okRows.length}件を取り込む`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>明細一覧</h2>
          <span className="eyebrow">{rows.length}件</span>
        </div>
        <div className="section-body" style={{ overflowX: "auto", paddingTop: 10 }}>
          {rows.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>まだ明細がありません。CSVを取り込んでください。</p>
          ) : (
            <table className="staff-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>日付</th>
                  <th style={{ textAlign: "right" }}>金額</th>
                  <th>店名</th>
                  <th>勘定科目</th>
                  <th>領収書照合</th>
                  <th style={{ textAlign: "right" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="en" style={{ whiteSpace: "nowrap" }}>{r.transaction_date}</td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(r.amount)}</td>
                    <td>{r.merchant_name ?? ""}</td>
                    <td>
                      <input
                        className="input"
                        list="acct-list-card"
                        defaultValue={r.account ?? ""}
                        style={{ width: 130 }}
                        disabled={pending}
                        onBlur={(e) => {
                          if ((e.target.value || "") !== (r.account ?? "")) saveAccount(r.id, e.target.value);
                        }}
                      />
                    </td>
                    <td>
                      {r.matched ? (
                        <span className="status-pill ok">照合済</span>
                      ) : (
                        <span className="status-pill wait">未照合</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn-mini ink" onClick={() => remove(r.id)} disabled={pending}>削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <datalist id="acct-list-card">
            {ACCOUNTS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
      </div>
    </>
  );
}
