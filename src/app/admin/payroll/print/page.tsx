import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PayrollAdjustment, Profile, TimeRecord } from "@/lib/types";
import { displayName } from "@/lib/display-name";
import { hhmm, NOMINATION_BACK_RATE, kaisukenBackRate } from "@/lib/payroll";
import { computeStaffPayroll, groupRecordsByStaff } from "@/lib/compute-staff-payroll";
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
  @page { size: A4 landscape; margin: 16mm 20mm; }
  body { background: #fff; }
  .no-print { display: none !important; }
  .payslip { box-shadow: none !important; max-width: none; margin: 0; page-break-after: always; }
  .payslip:last-child { page-break-after: auto; }
  .ps-grid th, .ps-grid td { padding: 9px 12px; }
}
.payslip { max-width: 940px; margin: 0 auto 22px; background: #fff; box-shadow: 0 1px 8px rgba(0,0,0,.08); font-size: 13px; }
.ps-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ps-grid th, .ps-grid td { border: 1.5px solid #1a2b4a; padding: 6px 9px; font-size: 12.5px; }
.ps-grid th { background: #dbe5f1; font-weight: 600; text-align: left; }
.ps-grid td.v { text-align: right; font-variant-numeric: tabular-nums; font-size: 14px; }
.ps-grid td.sec { background: #dbe5f1; font-weight: 700; text-align: center; width: 34px; vertical-align: middle; letter-spacing: 2px; }
.ps-grid .ttl { font-size: 15px; font-weight: 700; background: #fff; }
.ps-grid .meta { text-align: right; background: #fff; }
.ps-grid td.total { font-weight: 700; font-size: 16px; text-align: right; }
.ps-note { font-size: 10.5px; color: #667; margin: 8px 2px 0; }
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
  const [{ data: recordsRaw }, { data: staffRaw }, { data: nomRaw }, { data: kaisRaw }, { data: taxRaw }, { data: adjRaw }] = await Promise.all([
    supabase.from("time_records").select("*").gte("work_date", start).lte("work_date", end),
    supabase.from("profiles").select("*").eq("role", "staff").eq("is_active", true).order("full_name"),
    supabase.from("nomination_counts").select("staff_id, count").eq("month", month),
    supabase.from("kaisuken_counts").select("staff_id, count").eq("month", month),
    supabase.from("income_tax_overrides").select("staff_id, amount").eq("month", month),
    supabase.from("payroll_adjustments").select("staff_id, amount, label, taxable").eq("month", month),
  ]);
  const staff = (staffRaw as Profile[] | null) ?? [];
  const records = (recordsRaw as TimeRecord[] | null) ?? [];
  const nom = new Map(((nomRaw as { staff_id: string; count: number }[] | null) ?? []).map((r) => [r.staff_id, r.count]));
  const kais = new Map(((kaisRaw as { staff_id: string; count: number }[] | null) ?? []).map((r) => [r.staff_id, r.count]));
  const taxOverrides = new Map(((taxRaw as { staff_id: string; amount: number }[] | null) ?? []).map((r) => [r.staff_id, r.amount]));
  const adjustments = new Map(
    ((adjRaw as PayrollAdjustment[] | null) ?? []).map((r) => [r.staff_id, { amount: r.amount, label: r.label, taxable: r.taxable }])
  );
  const byStaff = groupRecordsByStaff(records);

  const rows = staff
    .map((s) => {
      const count = nom.get(s.id) ?? 0;
      const kaisCount = kais.get(s.id) ?? 0;
      // 計算は computeStaffPayroll に集約（画面・PDF・振込で必ず同じ結果にする）
      const { pay, nominationBack: back, kaisukenBackYen: kaisBack, adjustment, adjustmentLabel, gross, deduction: ded } =
        computeStaffPayroll({
          staff: s,
          records: byStaff.get(s.id) ?? [],
          nominationCount: count,
          kaisukenCount: kaisCount,
          taxOverride: taxOverrides.get(s.id) ?? null,
      adjustment: adjustments.get(s.id) ?? null,
        });
      const rate = NOMINATION_BACK_RATE;
      const kaisRate = kaisukenBackRate(kaisCount);
      return { s, pay, rate, count, back, kaisCount, kaisBack, kaisRate, adjustment, adjustmentLabel, gross, ded };
    })
    .filter((r) => r.pay.workedMin > 0 || r.count > 0 || r.kaisCount > 0 || r.adjustment !== 0);

  // 支給日＝翌月15日（当店の給与支払日）
  const payDate = m === 12 ? `${y + 1}年1月15日` : `${y}年${m + 1}月15日`;

  return (
    <div className="print-root" style={{ padding: "14px 18px 28px" }}>
      <style>{PRINT_CSS}</style>
      <PrintBar label={`${y}年${m}月 給与明細`} />

      {rows.map(({ s, pay, count, back, kaisCount, kaisBack, adjustment, adjustmentLabel, gross, ded }) => (
        <div className="payslip" key={s.id}>
          <table className="ps-grid">
            <colgroup>
              <col style={{ width: 34 }} />
              <col /><col /><col /><col />
            </colgroup>
            <tbody>
              {/* 見出し */}
              <tr>
                <td className="ttl" colSpan={3}>{y}年{m}月 給与明細書</td>
                <td className="meta" colSpan={2} style={{ fontWeight: 700, fontSize: 14 }}>{displayName(s)} 様</td>
              </tr>
              <tr>
                <td className="meta" colSpan={5}>{payDate}支給　{STORE}</td>
              </tr>

              {/* 勤務 */}
              <tr>
                <td className="sec" rowSpan={2}>勤務</td>
                <th>勤務日数</th><th>実働時間</th><th>うち残業</th><th>うち深夜</th>
              </tr>
              <tr>
                <td className="v">{pay.workedDays}日</td>
                <td className="v">{hhmm(pay.workedMin)}</td>
                <td className="v">{hhmm(pay.overtimeMin)}</td>
                <td className="v">{hhmm(pay.nightMin)}</td>
              </tr>

              {/* 支給 */}
              <tr>
                <td className="sec" rowSpan={4}>支給</td>
                <th>基本給</th><th>残業手当</th><th>深夜手当</th><th>通勤費（非課税）</th>
              </tr>
              <tr>
                <td className="v">{yen(pay.basePay)}</td>
                <td className="v">{yen(pay.overtimePay)}</td>
                <td className="v">{yen(pay.nightPay)}</td>
                <td className="v">{yen(pay.commute)}</td>
              </tr>
              <tr>
                <th>指名バック（{count}本）</th><th>回数券バック（{kaisCount}本）</th>
                <th>{adjustment !== 0 ? adjustmentLabel ?? "調整" : "調整"}</th><th>支給額合計</th>
              </tr>
              <tr>
                <td className="v">{yen(back)}</td>
                <td className="v">{yen(kaisBack)}</td>
                <td className="v">{adjustment !== 0 ? yen(adjustment) : "—"}</td>
                <td className="v" style={{ fontWeight: 700 }}>{yen(gross)}</td>
              </tr>

              {/* 控除 */}
              <tr>
                <td className="sec" rowSpan={4}>控除</td>
                <th>健康保険{s.kaigo_applicable ? "（介護含む）" : ""}</th><th>厚生年金</th><th>雇用保険</th><th>社会保険計</th>
              </tr>
              <tr>
                <td className="v">{yen(ded.healthInsurance)}</td>
                <td className="v">{yen(ded.pension)}</td>
                <td className="v">{yen(ded.empInsurance)}</td>
                <td className="v">({yen(ded.socialTotal)})</td>
              </tr>
              <tr>
                <th>課税対象額</th><th>所得税（{(s.tax_column ?? "otsu") === "kou" ? "甲欄" : "乙欄"}）</th><th>住民税</th><th>控除計</th>
              </tr>
              <tr>
                <td className="v">({yen(ded.taxableBase)})</td>
                <td className="v">{yen(ded.incomeTax)}</td>
                <td className="v">{yen(0)}</td>
                <td className="v" style={{ fontWeight: 700 }}>{yen(ded.socialTotal + ded.incomeTax)}</td>
              </tr>

              {/* 差引支給額 */}
              <tr>
                <th colSpan={3} style={{ textAlign: "right", fontSize: 14 }}>差引支給額</th>
                <td className="total" colSpan={2}>{yen(ded.net)}</td>
              </tr>
            </tbody>
          </table>
          <p className="ps-note">
            ※ 賃金は1分単位で計算。時給は期間別（6/8〜6/19 ¥1,060／6/20〜 ¥1,600）。回数券バックは本数連動（1〜3本¥1,000／4〜7本¥2,000／8本〜¥3,000）。
            通勤費は非課税として課税対象から除外。所得税は源泉徴収税額表（令和8年分）月額表による。
          </p>
        </div>
      ))}
      {rows.length === 0 && <p className="help" style={{ textAlign: "center" }}>この月の対象がありません。</p>}
    </div>
  );
}
