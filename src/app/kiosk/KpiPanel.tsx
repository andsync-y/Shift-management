"use client";

import type { FcKpiData } from "@/lib/fc-kpi/types";

const yen = (n?: number) => (typeof n === "number" ? `¥${Math.round(n).toLocaleString()}` : "—");
const pct = (r?: number) => (typeof r === "number" ? `${(r * 100).toFixed(1)}%` : "—");
const num = (n?: number) => (typeof n === "number" ? n.toLocaleString() : "—");
const mmdd = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");

// 本部KPIをkioskに表示。当月の数値＋昨日の新規/指名スタッフ。
export default function KpiPanel({ data, asOf }: { data: FcKpiData; asOf?: string }) {
  const m = data.month ?? {};
  const y = data.yesterday ?? {};
  const hasMonth = m.sales != null || m.newCount != null || m.nominationCount != null;
  const hasY = (y.newSales?.length ?? 0) > 0 || (y.nominations?.length ?? 0) > 0;
  if (!hasMonth && !hasY) return null;

  return (
    <div className="kpi">
      <div className="kpi-head">
        <span className="kpi-title">店舗実績</span>
        {asOf && <span className="kpi-asof">{mmdd(asOf)} 時点</span>}
      </div>

      {hasMonth && (
        <div className="kpi-stats">
          <div className="kpi-card">
            <div className="kpi-k">当月 売上</div>
            <div className="kpi-v">{yen(m.sales)}</div>
          </div>
          {m.treatmentSales != null && (
            <div className="kpi-card">
              <div className="kpi-k">施術売上</div>
              <div className="kpi-v">{yen(m.treatmentSales)}</div>
            </div>
          )}
          {m.couponSales != null && (
            <div className="kpi-card">
              <div className="kpi-k">回数券売上</div>
              <div className="kpi-v">{yen(m.couponSales)}</div>
            </div>
          )}
          {m.designationSales != null && (
            <div className="kpi-card">
              <div className="kpi-k">指名売上</div>
              <div className="kpi-v">{yen(m.designationSales)}</div>
            </div>
          )}
          <div className="kpi-card">
            <div className="kpi-k">新規販売</div>
            <div className="kpi-v">
              {num(m.newCount)}<small>件</small> <span className="kpi-rate">{pct(m.newRate)}</span>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-k">指名</div>
            <div className="kpi-v">
              {num(m.nominationCount)}<small>件</small> <span className="kpi-rate">{pct(m.nominationRate)}</span>
            </div>
          </div>
        </div>
      )}

      {hasY && (
        <div className="kpi-y">
          <div className="kpi-yrow">
            <span className="kpi-ylabel">昨日{y.date ? `(${mmdd(y.date)})` : ""} 新規</span>
            <span className="kpi-chips">
              {(y.newSales ?? []).length === 0 ? (
                <span className="muted">—</span>
              ) : (
                (y.newSales ?? []).map((s, i) => (
                  <span className="kpi-chip" key={i}>
                    {s.staff}
                    {s.ticket ? ` ×${s.ticket}回` : ""}
                  </span>
                ))
              )}
            </span>
          </div>
          <div className="kpi-yrow">
            <span className="kpi-ylabel">昨日 指名</span>
            <span className="kpi-chips">
              {(y.nominations ?? []).length === 0 ? (
                <span className="muted">—</span>
              ) : (
                (y.nominations ?? []).map((s, i) => (
                  <span className="kpi-chip nom" key={i}>
                    {s.staff}
                    {s.count ? ` ${s.count}` : ""}
                  </span>
                ))
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
