"use client";

import { useState } from "react";

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;

// 全銀フォーマット（総合振込）ファイルのダウンロード。SMBC Web21/ValueDoor にアップロードして実行。
export default function TransferPanel({
  month,
  defaultDate,
  count,
  total,
  missing,
}: {
  month: string;
  defaultDate: string;
  count: number;
  total: number;
  missing: string[];
}) {
  const [date, setDate] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/payroll/transfer?month=${month}&date=${date}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setMsg(j?.error ?? "ファイル生成に失敗しました。");
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `furikomi_${month}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setMsg("通信に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="section-body" style={{ paddingTop: 14 }}>
      <p className="help" style={{ marginTop: 0 }}>
        当月の給与から<strong>総合振込データ（全銀フォーマット）</strong>を作成します。ダウンロードして
        三井住友のビジネスバンキング（Web21／ValueDoor）にアップロード → 内容確認のうえ実行してください。
        金額は<strong>差引支給（手取り・控除後）</strong>です。源泉「要入力」が残っていると暫定額になるため、先に上の表で確定してください。
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          振込指定日
          <input type="date" className="input en" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
        </label>
        <button className="btn-fill" onClick={download} disabled={busy || count === 0}>
          {busy ? "作成中…" : "全銀ファイルをダウンロード"}
        </button>
        <span className="help" style={{ margin: 0 }}>
          対象 {count} 名・合計 {yen(total)}
        </span>
      </div>
      {msg && (
        <p className="help" style={{ marginTop: 10, marginBottom: 0, color: "#9a3a30", whiteSpace: "pre-wrap" }}>{msg}</p>
      )}
      {missing.length > 0 && (
        <p className="help" style={{ marginTop: 10, marginBottom: 0, color: "#94560e" }}>
          ⚠️ 口座情報が未登録のため振込対象外：{missing.join("・")}（「スタッフ管理」で銀行コード・支店コード・口座番号・受取人カナを登録してください）
        </p>
      )}
    </div>
  );
}
