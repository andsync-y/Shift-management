"use client";

import { useActionState, useState, useTransition } from "react";
import { createFixedCost, updateFixedCost, deleteFixedCost, type ActionResult } from "./actions";
import type { FixedCost } from "@/lib/accounting/fixed-costs";

const CATEGORIES = ["地代家賃", "ロイヤリティ", "広告宣伝費", "水道光熱費", "通信費", "保険料", "消耗品費", "借入返済", "その他"];

function Fields({ c }: { c?: FixedCost }) {
  return (
    <>
      <input name="name" className="input" defaultValue={c?.name ?? ""} placeholder="名称" required style={{ minWidth: 150 }} />
      <input name="amount" type="number" min={0} className="input en" defaultValue={c?.amount ?? ""} placeholder="月額" style={{ width: 110 }} required />
      <select name="category" className="select" defaultValue={c?.category ?? "その他"} style={{ width: 130 }}>
        {CATEGORIES.map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, whiteSpace: "nowrap" }}>
        <input name="pl_expense" type="checkbox" defaultChecked={c ? c.pl_expense : true} />
        経費(P&L)
      </label>
      <input name="start_month" type="month" className="input en" defaultValue={c?.start_month ?? ""} style={{ width: 140 }} title="適用開始月" />
      <span style={{ color: "var(--ink-3)" }}>〜</span>
      <input name="end_month" type="month" className="input en" defaultValue={c?.end_month ?? ""} style={{ width: 140 }} title="適用終了月" />
    </>
  );
}

function Row({ c }: { c: FixedCost }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateFixedCost.bind(null, c.id), null);
  const [del, startDel] = useTransition();
  return (
    <form action={action} className="fc-row" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
      <Fields c={c} />
      <button type="submit" className="btn-mini" disabled={pending}>{pending ? "…" : "保存"}</button>
      <button
        type="button"
        className="btn-mini ink"
        disabled={del}
        onClick={() => {
          if (confirm(`「${c.name}」を削除しますか？`)) startDel(() => deleteFixedCost(c.id));
        }}
      >
        削除
      </button>
      {state && <span className="help" style={{ margin: 0, color: state.ok ? "#3d6b4f" : "#9a3a30" }}>{state.message}</span>}
    </form>
  );
}

export default function FixedCostManager({ costs }: { costs: FixedCost[] }) {
  const [addState, addAction, adding] = useActionState<ActionResult | null, FormData>(createFixedCost, null);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div>
      <div style={{ marginBottom: 6, display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--ink-2)" }}>
        <span style={{ flex: "1 1 150px" }}>名称</span>
        <span>月額 / 科目 / 経費か / 適用期間（空欄=制限なし）</span>
      </div>
      {costs.map((c) => (
        <Row key={c.id} c={c} />
      ))}

      {showAdd ? (
        <form action={addAction} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "12px 0 0" }}>
          <Fields />
          <button type="submit" className="btn-fill" disabled={adding}>{adding ? "追加中…" : "追加"}</button>
          <button type="button" className="btn-outline" onClick={() => setShowAdd(false)}>閉じる</button>
          {addState && <span className="help" style={{ margin: 0, color: addState.ok ? "#3d6b4f" : "#9a3a30" }}>{addState.message}</span>}
        </form>
      ) : (
        <button type="button" className="btn-outline" style={{ marginTop: 12 }} onClick={() => setShowAdd(true)}>
          ＋ 固定費を追加
        </button>
      )}

      <p className="help" style={{ marginTop: 14, marginBottom: 0 }}>
        「経費(P&L)」のチェックを外した項目（借入返済など）は<strong>経常利益から除外</strong>し、月次P&Lの「キャッシュ収支」でのみ控除します。
        適用開始/終了月で期間を限定できます（例：リジョブ〜2026-07、公庫2026-08〜）。
        ※ カード明細に既にある費用は二重計上になるため、固定費に入れないでください。
      </p>
    </div>
  );
}
