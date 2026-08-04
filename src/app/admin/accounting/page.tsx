import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { sumFixedCosts, type FixedCost } from "@/lib/accounting/fixed-costs";

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
  const [{ data, error }, { data: fcData }] = await Promise.all([
    admin.from("v_pl_monthly").select("*").order("month", { ascending: false }),
    admin.from("fixed_costs").select("*"),
  ]);
  const fixedCosts = (fcData ?? []) as FixedCost[];
  const rows = ((data ?? []) as PlRow[]).map((r) => {
    const { expense: fixedExpense, repayment } = sumFixedCosts(fixedCosts, r.month);
    const ordinaryProfit = r.sales - r.expense - fixedExpense - r.labor_cost; // 経常利益
    return { ...r, fixedExpense, repayment, ordinaryProfit, cashFlow: ordinaryProfit - repayment };
  });

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">経理</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>
            P&amp;L
          </h1>
          <p className="sub">月次の売上・販管費・固定費・人件費 → 経常利益・キャッシュ収支</p>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>月次サマリ</h2>
          <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/admin/accounting/fixed-costs" className="btn-outline" style={{ fontSize: 12.5, padding: "7px 12px" }}>
              固定費を管理
            </Link>
            <span className="eyebrow">Monthly</span>
          </span>
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
                  <th style={{ textAlign: "right" }}>販管費(カード)</th>
                  <th style={{ textAlign: "right" }}>固定費</th>
                  <th style={{ textAlign: "right" }}>人件費</th>
                  <th style={{ textAlign: "right" }}>経常利益</th>
                  <th style={{ textAlign: "right" }}>借入返済</th>
                  <th style={{ textAlign: "right" }}>月次収支</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month}>
                    <td className="en" style={{ whiteSpace: "nowrap" }}>{r.month}</td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(r.sales)}</td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(r.expense)}</td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(r.fixedExpense)}</td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(r.labor_cost)}</td>
                    <td className="en" style={{ textAlign: "right", fontWeight: 700, color: r.ordinaryProfit < 0 ? "#9a3a30" : undefined }}>
                      {yen(r.ordinaryProfit)}
                    </td>
                    <td className="en muted" style={{ textAlign: "right" }}>{r.repayment ? yen(r.repayment) : "—"}</td>
                    <td className="en" style={{ textAlign: "right", fontWeight: 700, color: r.cashFlow < 0 ? "#9a3a30" : "#3d6b4f" }}>
                      {yen(r.cashFlow)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="help" style={{ marginBottom: 0 }}>
            <strong>経常利益＝売上−販管費(カード)−固定費−人件費</strong>（借入返済は除外）。
            <strong>月次収支＝経常利益−借入返済</strong>（実際の手残りに近い現金ベース）。固定費は「固定費を管理」で編集。
            ※ 売上は「売上入力」の月次手入力値。人件費は実打刻×時給の簡易値（休憩控除・割増・期間別時給は未反映＝正確な支給額は「給与計算」）。
            カード明細に既にある費用を固定費にも入れると二重計上になります。
          </p>
        </div>
      </div>
    </div>
  );
}
