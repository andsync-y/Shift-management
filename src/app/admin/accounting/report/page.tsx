import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import ReportTable, { type AccountMonthRow } from "./ReportTable";

function jstYear(): number {
  return new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : jstYear();

  const admin = createAdminClient();
  const { data } = await admin
    .from("v_expense_by_account_monthly")
    .select("*")
    .gte("month", `${year}-01`)
    .lte("month", `${year}-12`);
  const rows = ((data ?? []) as { month: string; account: string; total: number }[]).map<AccountMonthRow>(
    (r) => ({ month: r.month, account: r.account, total: Number(r.total) })
  );

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">経理</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>
            Expense Report
          </h1>
          <p className="sub">勘定科目別 経費集計 — {year}年</p>
        </div>
        <div className="month-nav">
          <a className="btn-outline" href={`/admin/accounting/report?year=${year - 1}`}>← {year - 1}</a>
          <a className="btn-outline" href={`/admin/accounting/report?year=${year + 1}`}>{year + 1} →</a>
        </div>
      </div>

      <ReportTable rows={rows} year={year} />
    </div>
  );
}
