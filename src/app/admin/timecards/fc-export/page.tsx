import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { buildFcHqReport } from "@/lib/fc-hq/report";
import FcExportTable from "./FcExportTable";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function jstYearMonth(): string {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}`;
}

// FC本部システムへの転記支援画面（オーナー専用）。
// 本部「勤務時間」「スタッフ管理」フォームと同じ形でデータを表示し、
// 各セルをコピーして手入力を高速・正確にする。
export default async function FcExportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : jstYearMonth();
  const [y, m] = month.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;

  const report = await buildFcHqReport(month);

  return (
    <div className="page page-wide">
      <div className="crumbs">
        <Link href="/admin/timecards">勤怠管理</Link>
        <span className="sep">/</span>
        <span>FC本部 転記</span>
      </div>

      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Owner Console</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>FC HQ Export</h1>
          <p className="sub">FC本部 転記支援 — {y}年{m}月（{report.store}）</p>
        </div>
        <div className="month-nav">
          <a className="btn-outline" href={`/admin/timecards/fc-export?month=${prev}`}>← 前月</a>
          <form method="get" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="month" name="month" defaultValue={month} className="input en" style={{ width: 160 }} />
            <button type="submit" className="btn-outline">表示</button>
          </form>
          <a className="btn-outline" href={`/admin/timecards/fc-export?month=${next}`}>翌月 →</a>
        </div>
      </div>

      <FcExportTable month={month} rows={report.staff} />
    </div>
  );
}
