// 給与明細PDFの元データ組立。給与画面・印刷ページと同じ計算
// （computePayroll + computeDeductions + バック手入力）で1人分ずつ作る。
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, TimeRecord } from "@/lib/types";
import { computePayroll, hhmm, NOMINATION_BACK_RATE, kaisukenBack, type PayrollRecord } from "@/lib/payroll";
import { computeDeductions } from "@/lib/deductions";
import { displayName } from "@/lib/display-name";
import type { PayslipData } from "./pdf";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export interface PayslipEntry {
  staffId: string;
  name: string;
  lineUserId: string | null;
  data: PayslipData;
}

export async function collectPayslips(
  supabase: SupabaseClient,
  month: string // "YYYY-MM"
): Promise<PayslipEntry[]> {
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${pad(m)}-01`;
  const end = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
  const monthLabel = `${y}年${m}月`;
  const payDateLabel = m === 12 ? `${y + 1}年1月15日` : `${y}年${m + 1}月15日`;
  const storeName = process.env.STORE_NAME || "全力ストレッチ岐阜長良店";

  const [{ data: recordsRaw }, { data: staffRaw }, { data: nomRaw }, { data: kaisRaw }, { data: taxRaw }] =
    await Promise.all([
      supabase.from("time_records").select("*").gte("work_date", start).lte("work_date", end),
      supabase.from("profiles").select("*").eq("role", "staff").eq("is_active", true).order("full_name"),
      supabase.from("nomination_counts").select("staff_id, count").eq("month", month),
      supabase.from("kaisuken_counts").select("staff_id, count").eq("month", month),
      supabase.from("income_tax_overrides").select("staff_id, amount").eq("month", month),
    ]);
  const staff = (staffRaw as Profile[] | null) ?? [];
  const records = (recordsRaw as TimeRecord[] | null) ?? [];
  const nom = new Map(((nomRaw as { staff_id: string; count: number }[] | null) ?? []).map((r) => [r.staff_id, r.count]));
  const kais = new Map(((kaisRaw as { staff_id: string; count: number }[] | null) ?? []).map((r) => [r.staff_id, r.count]));
  const taxOverrides = new Map(
    ((taxRaw as { staff_id: string; amount: number }[] | null) ?? []).map((r) => [r.staff_id, r.amount])
  );

  const byStaff = new Map<string, PayrollRecord[]>();
  for (const r of records) {
    if (!byStaff.has(r.staff_id)) byStaff.set(r.staff_id, []);
    byStaff.get(r.staff_id)!.push(r);
  }

  const entries: PayslipEntry[] = [];
  for (const s of staff) {
    const pay = computePayroll(byStaff.get(s.id) ?? [], s.hourly_wage, s.commute_allowance ?? 0, s.commute_distance_km ?? 0);
    const count = nom.get(s.id) ?? 0;
    const back = NOMINATION_BACK_RATE * count;
    const kaisCount = kais.get(s.id) ?? 0;
    const kaisBack = kaisukenBack(kaisCount);
    const gross = pay.gross + back + kaisBack;
    if (pay.workedMin <= 0 && count === 0 && kaisCount === 0) continue; // 対象なし
    const ded = computeDeductions({
      gross,
      commute: pay.commute,
      taxColumn: s.tax_column ?? "otsu",
      dependents: s.dependents_count ?? 0,
      empInsuranceEnrolled: s.emp_insurance_enrolled ?? true,
      shahoEnrolled: s.shaho_enrolled ?? false,
      kaigoApplicable: s.kaigo_applicable ?? false,
      taxOverride: taxOverrides.get(s.id) ?? null,
    });
    entries.push({
      staffId: s.id,
      name: displayName(s),
      lineUserId: s.line_user_id,
      data: {
        staffName: displayName(s),
        monthLabel,
        payDateLabel,
        storeName,
        workedDays: pay.workedDays,
        workedLabel: hhmm(pay.workedMin),
        overtimeLabel: hhmm(pay.overtimeMin),
        nightLabel: hhmm(pay.nightMin),
        basePay: pay.basePay,
        overtimePay: pay.overtimePay,
        nightPay: pay.nightPay,
        commute: pay.commute,
        nominationCount: count,
        nominationBack: back,
        kaisukenCount: kaisCount,
        kaisukenBack: kaisBack,
        gross,
        healthInsurance: ded.healthInsurance,
        pension: ded.pension,
        empInsurance: ded.empInsurance,
        socialTotal: ded.socialTotal,
        taxableBase: ded.taxableBase,
        incomeTax: ded.incomeTax,
        taxColumnLabel: (s.tax_column ?? "otsu") === "kou" ? "甲欄" : "乙欄",
        residentTax: 0,
        net: ded.net,
        kaigo: s.kaigo_applicable ?? false,
      },
    });
  }
  return entries;
}
