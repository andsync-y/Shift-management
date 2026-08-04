"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMonthlySale, syncSquareSales, upsertMonthlySale } from "../actions";

export interface MonthlySale {
  id: string;
  month: string;
  amount: number;
  memo: string | null;
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;
function thisMonth(): string {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function SalesManager({ sales }: { sales: MonthlySale[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [month, setMonth] = useState(thisMonth());
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function submit() {
    start(async () => {
      const res = await upsertMonthlySale(month, Number(amount || 0), memo);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) {
        setAmount("");
        setMemo("");
        router.refresh();
      }
    });
  }
  function edit(s: MonthlySale) {
    setMonth(s.month);
    setAmount(String(s.amount));
    setMemo(s.memo ?? "");
  }
  function remove(id: string) {
    if (!confirm("この売上を削除しますか？")) return;
    start(async () => {
      const res = await deleteMonthlySale(id);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });
  }

  const total = sales.reduce((a, s) => a + s.amount, 0);

  return (
    <>
      <div className="section">
        <div className="section-head">
          <h2>月次売上を入力</h2>
          <span className="eyebrow">同じ月は上書き</span>
        </div>
        <div className="section-body">
          <div className="bk-row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ margin: 0 }}>
              <label>対象月</label>
              <input type="month" className="input en" value={month} onChange={(e) => setMonth(e.target.value)} disabled={pending} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>売上（円）</label>
              <input
                type="number"
                min={0}
                className="input en"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="例: 1200000"
                disabled={pending}
                style={{ width: 160 }}
              />
            </div>
            <div className="field" style={{ margin: 0, flex: 1 }}>
              <label>メモ（任意）</label>
              <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} disabled={pending} />
            </div>
            <button className="btn-fill" onClick={submit} disabled={pending || !amount}>
              {pending ? "保存中…" : "保存"}
            </button>
            <button
              className="btn-outline"
              onClick={() =>
                start(async () => {
                  const res = await syncSquareSales(month);
                  setMsg({ ok: res.ok, text: res.message });
                  if (res.ok) router.refresh();
                })
              }
              disabled={pending}
              title="選択中の月の売上をSquareから取得して上書きします"
            >
              Squareから取得
            </button>
          </div>
          {msg && (
            <p className="help" style={{ marginTop: 10, marginBottom: 0, color: msg.ok ? "#3d6b4f" : "#9a3a30" }}>
              {msg.text}
            </p>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>売上一覧</h2>
          <span className="eyebrow">合計 {yen(total)}</span>
        </div>
        <div className="section-body" style={{ paddingTop: 10 }}>
          {sales.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>まだ売上の入力がありません。</p>
          ) : (
            <table className="staff-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>月</th>
                  <th style={{ textAlign: "right" }}>売上</th>
                  <th>メモ</th>
                  <th style={{ textAlign: "right" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td className="en" style={{ whiteSpace: "nowrap" }}>{s.month}</td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(s.amount)}</td>
                    <td className="soft">{s.memo ?? ""}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn-mini" onClick={() => edit(s)} disabled={pending}>編集</button>
                      <button className="btn-mini ink" onClick={() => remove(s.id)} disabled={pending}>削除</button>
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
