import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;

type PlRow = {
  month: string;
  sales: number;
  expense: number;
  labor_cost: number;
  operating_profit: number;
};

export default async function AccountingPage() {
  await requireAdmin();
  // 財務ビューは service role 経由でのみ参照可（RLS回避ビューのため）
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("v_pl_monthly")
    .select("*")
    .order("month", { ascending: false });
  const rows = (data ?? []) as PlRow[];

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">経理</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>
            P&amp;L
          </h1>
          <p className="sub">月次の売上・販管費・人件費（実打刻ベース）</p>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>月次サマリ</h2>
          <span className="eyebrow">Monthly</span>
        </div>
        <div className="section-body" style={{ overflowX: "auto", paddingTop: 10 }}>
          {error ? (
            <p className="help" style={{ margin: 0, color: "#9a3a30" }}>
              ビューを参照できませんでした（マイグレーション 0022 を適用してください）：{error.message}
            </p>
          ) : rows.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>データがありません。打刻・経費が入ると集計されます。</p>
          ) : (
            <table className="staff-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>月</th>
                  <th style={{ textAlign: "right" }}>売上</th>
                  <th style={{ textAlign: "right" }}>販管費（カード）</th>
                  <th style={{ textAlign: "right" }}>人件費（実績）</th>
                  <th style={{ textAlign: "right" }}>営業利益</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month}>
                    <td className="en" style={{ whiteSpace: "nowrap" }}>{r.month}</td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(r.sales)}</td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(r.expense)}</td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(r.labor_cost)}</td>
                    <td
                      className="en"
                      style={{ textAlign: "right", fontWeight: 700, color: r.operating_profit < 0 ? "#9a3a30" : undefined }}
                    >
                      {yen(r.operating_profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="help" style={{ marginBottom: 0 }}>
            ※ 売上は「売上入力」の月次手入力値。人件費は実打刻×時給の簡易値（休憩控除・割増・期間別時給は未反映）。
            正確な支給額は「給与計算」を参照。
          </p>
        </div>
      </div>
    </div>
  );
}
