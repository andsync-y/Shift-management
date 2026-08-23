"use client";

import { useActionState } from "react";
import { saveKpi } from "./actions";
import type { FcKpiData } from "@/lib/fc-kpi/types";

function linesNew(rows?: { staff: string; ticket?: number | null }[]) {
  return (rows ?? []).map((r) => (r.ticket ? `${r.staff},${r.ticket}` : r.staff)).join("\n");
}
function linesNom(rows?: { staff: string; count?: number | null }[]) {
  return (rows ?? []).map((r) => (r.count ? `${r.staff},${r.count}` : r.staff)).join("\n");
}

// 本部KPIの手入力フォーム（フォールバック）。スクレイパが入れた最新値を初期表示し、上書き保存できる。
export default function KpiForm({ initial, asOf }: { initial: FcKpiData; asOf: string }) {
  const [state, action, pending] = useActionState(saveKpi, null);
  const m = initial.month ?? {};
  const y = initial.yesterday ?? {};
  const pctVal = (r?: number) => (typeof r === "number" ? Math.round(r * 1000) / 10 : "");

  return (
    <form action={action}>
      <div className="section">
        <div className="section-head"><h2>取得日</h2></div>
        <div className="section-body">
          <div className="field" style={{ maxWidth: 220 }}>
            <label>スナップショット取得日</label>
            <input name="as_of" type="date" className="input en" defaultValue={asOf} />
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>当月</h2></div>
        <div className="section-body">
          <div className="profile-grid">
            <div className="field"><label>対象月(YYYY-MM)</label><input name="month" className="input en" defaultValue={m.month ?? ""} placeholder="2026-06" /></div>
            <div className="field"><label>売上（円）</label><input name="sales" type="number" className="input" defaultValue={m.sales ?? ""} /></div>
            <div className="field"><label>施術売上（円）</label><input name="treatmentSales" type="number" className="input" defaultValue={m.treatmentSales ?? ""} /></div>
            <div className="field"><label>回数券売上（円）</label><input name="couponSales" type="number" className="input" defaultValue={m.couponSales ?? ""} /></div>
            <div className="field"><label>指名売上（円）</label><input name="designationSales" type="number" className="input" defaultValue={m.designationSales ?? ""} /></div>
            <div className="field"><label>新規販売数</label><input name="newCount" type="number" className="input" defaultValue={m.newCount ?? ""} /></div>
            <div className="field"><label>新規販売率（%）</label><input name="newRate" type="number" step="0.1" className="input" defaultValue={pctVal(m.newRate)} /></div>
            <div className="field"><label>指名数</label><input name="nominationCount" type="number" className="input" defaultValue={m.nominationCount ?? ""} /></div>
            <div className="field"><label>指名率（%）</label><input name="nominationRate" type="number" step="0.1" className="input" defaultValue={pctVal(m.nominationRate)} /></div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><h2>昨日</h2></div>
        <div className="section-body">
          <div className="field" style={{ maxWidth: 220, marginBottom: 14 }}>
            <label>対象日</label>
            <input name="yDate" type="date" className="input en" defaultValue={y.date ?? ""} />
          </div>
          <div className="profile-grid">
            <div className="field">
              <label>新規販売スタッフ（1行に「名前,回数券の回数」）</label>
              <textarea name="newSales" className="input" rows={4} defaultValue={linesNew(y.newSales)} placeholder={"AINA,10\nKAYO,6"} />
            </div>
            <div className="field">
              <label>更新販売スタッフ（1行に「名前,回数券の回数」）</label>
              <textarea name="renewals" className="input" rows={4} defaultValue={linesNew(y.renewals)} placeholder={"AINA,3\nKAYO,5"} />
            </div>
            <div className="field">
              <label>指名獲得スタッフ（1行に「名前,件数」※件数は任意）</label>
              <textarea name="nominations" className="input" rows={4} defaultValue={linesNom(y.nominations)} placeholder={"AINA,3\nMIYUKA"} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button type="submit" className="btn-fill" disabled={pending}>{pending ? "保存中…" : "保存"}</button>
        {state && <span className="help" style={{ color: state.ok ? "#3d6b4f" : "#9a3a30" }}>{state.message}</span>}
      </div>
    </form>
  );
}
