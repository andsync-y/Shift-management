import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile, TimeRecord } from "@/lib/types";
import { displayName } from "@/lib/display-name";
import { computePayroll, hhmm, NOMINATION_BACK_RATE, type PayrollRecord } from "@/lib/payroll";
import PrintBar from "./PrintBar";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function jstYearMonth(): string {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}`;
}
const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;

const STORE = process.env.STORE_NAME || "全力ストレッチ岐阜長良店";

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  body { background: #fff; }
  .no-print { display: none !important; }
  .payslip { box-shadow: none !important; border: 1px solid #ccc !important; page-break-after: always; }
  .payslip:last-child { page-break-after: auto; }
}
.payslip { max-width: 720px; margin: 0 auto 18px; border: 1px solid var(--line); border-radius: 10px; padding: 22px 26px; background: #fff; box-shadow: 0 1px 8px rgba(0,0,0,.08); }
.ps-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid var(--ink); padding-bottom: 10px; margin-bottom: 14px; }
.ps-title { font-size: 18px; font-weight: 700; }
.ps-store { font-size: 12px; color: var(--ink-2); }
.ps-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.ps-table td { padding: 7px 4px; border-bottom: 1px solid var(--line); }
.ps-table td.k { color: var(--ink-2); }
.ps-table td.v { text-align: right; font-variant-numeric: tabular-nums; }
.ps-total td { border-top: 2px solid var(--ink); border-bottom: 0; font-weight: 700; font-size: 16px; padding-top: 12px; }
.ps-note { font-size: 11px; color: var(--ink-3); margin-top: 12px; }
`;

export default async function PayslipPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : jstYearMonth();
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${pad(m)}-01`;
  const end = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;

  const supabase = await createClient();
  const [{ data: recordsRaw }, { data: staffRaw }, { data: nomRaw }] = await Promise.all([
    supabase.from("time_records").select("*").gte("work_date", start).lte("work_date", end),
    supabase.from("profiles").select("*").eq("role", "staff").eq("is_active", true).order("full_name"),
    supabase.from("nomination_counts").select("staff_id, count").eq("month", month),
  ]);
  const staff = (staffRaw as Profile[] | null) ?? [];
  const records = (recordsRaw as TimeRecord[] | null) ?? [];
  const nom = new Map(((nomRaw as { staff_id: string; count: number }[] | null) ?? []).map((r) => [r.staff_id, r.count]));
  const byStaff = new Map<string, PayrollRecord[]>();
  for (const r of records) (byStaff.get(r.staff_id) ?? byStaff.set(r.staff_id, []).get(r.staff_id)!).push(r);

  const rows = staff
    .map((s) => {
      const pay = computePayroll(byStaff.get(s.id) ?? [], s.hourly_wage, s.commute_allowance ?? 0, s.commute_distance_km ?? 0);
      const rate = NOMINATION_BACK_RATE;
      const count = nom.get(s.id) ?? 0;
      const back = rate * count;
      return { s, pay, rate, count, back, gross: pay.gross + back };
    })
    .filter((r) => r.pay.workedMin > 0 || r.count > 0);

  return (
    <div className="print-root" style={{ padding: "14px 18px 28px" }}>
      <style>{PRINT_CSS}</style>
      <PrintBar label={`${y}年${m}月 給与明細`} />

      {rows.map(({ s, pay, rate, count, back, gross }) => (
        <div className="payslip" key={s.id}>
          <div className="ps-head">
            <div>
              <div className="ps-title">{displayName(s)} 様</div>
              <div className="ps-store">{y}年{m}月 給与明細</div>
            </div>
            <div className="ps-store">{STORE}</div>
          </div>
          <table className="ps-table">
            <tbody>
              <tr><td className="k">拘束時間</td><td className="v">{hhmm(pay.clockedMin)}</td></tr>
              <tr><td className="k">実働時間（休憩控除・15分丸め後）</td><td className="v">{hhmm(pay.workedMin)}</td></tr>
              <tr><td className="k">うち残業</td><td className="v">{hhmm(pay.overtimeMin)}</td></tr>
              <tr><td className="k">うち深夜</td><td className="v">{hhmm(pay.nightMin)}</td></tr>
              <tr><td className="k">基本給</td><td className="v">{yen(pay.basePay)}</td></tr>
              <tr><td className="k">残業割増</td><td className="v">{yen(pay.overtimePay)}</td></tr>
              <tr><td className="k">深夜割増</td><td className="v">{yen(pay.nightPay)}</td></tr>
              <tr><td className="k">交通費{s.commute_distance_km ? `（${s.commute_distance_km}km×2×15円×${pay.workedDays}日）` : ""}</td><td className="v">{yen(pay.commute)}</td></tr>
              <tr><td className="k">指名バック（{count}本 × {yen(rate)}）</td><td className="v">{yen(back)}</td></tr>
              <tr className="ps-total"><td>総支給（額面）</td><td className="v">{yen(gross)}</td></tr>
            </tbody>
          </table>
          <p className="ps-note">
            ※ 源泉徴収・社会保険料等は未控除の額面です。時給は期間別（6/8〜6/19 ¥1,060／6/20〜7/31 ¥1,600）。
          </p>
        </div>
      ))}
      {rows.length === 0 && <p className="help" style={{ textAlign: "center" }}>この月の対象がありません。</p>}
    </div>
  );
}
