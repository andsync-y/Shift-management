// =====================================================================
// スタッフ1名分の月次給与を計算する唯一の入口
// =====================================================================
// これまで「打刻→給与→バック加算→控除」の同じ組み合わせが
//   ・給与画面 (admin/payroll/page.tsx)
//   ・給与明細の印刷 (admin/payroll/print/page.tsx)
//   ・給与明細PDF (lib/payslip/data.ts)
//   ・全銀振込データ (api/payroll/transfer/route.ts)
// の4か所にコピーされており、計算仕様を変えるたびに4か所を直す必要があった
// （＝どこか1つを直し忘れると、画面とPDFと振込額がずれる）。
//
// 計算の変更は必ずこのファイルに入れる。呼び出し側は結果を表示するだけにする。
// =====================================================================

import type { Profile } from "@/lib/types";
import {
  computePayroll,
  kaisukenBack,
  NOMINATION_BACK_RATE,
  type PayrollRecord,
  type PayrollResult,
} from "@/lib/payroll";
import { computeDeductions, type DeductionResult } from "@/lib/deductions";

/** 月次給与の計算に必要な、スタッフ1名分の入力。 */
export interface StaffPayrollInput {
  staff: Profile;
  /** その月の打刻（このスタッフの分のみ） */
  records: PayrollRecord[];
  /** 指名本数（手入力 or FC取込） */
  nominationCount: number;
  /** 回数券販売本数（新規＋更新） */
  kaisukenCount: number;
  /** 源泉所得税の手入力（あれば自動計算より優先。無ければ null） */
  taxOverride: number | null;
  /**
   * 月別の調整（立替精算・臨時手当・貸付返済など）。無ければ null。
   * amount > 0 は支給・amount < 0 は控除。taxable=false は課税対象から除く。
   */
  adjustment?: { amount: number; label?: string | null; taxable: boolean } | null;
}

/** 月次給与の計算結果。画面・PDF・振込のすべてがこれを使う。 */
export interface StaffPayrollResult {
  /** 労働時間と時間ベースの支給（基本給・割増・交通費） */
  pay: PayrollResult;
  /** 指名バック（本数 × 単価） */
  nominationBack: number;
  /** 回数券バック（本数連動の段階単価 × 本数） */
  kaisukenBackYen: number;
  /** 月別の調整額（支給は正・控除は負）。無ければ0 */
  adjustment: number;
  /** 調整額の摘要（明細に出す） */
  adjustmentLabel: string | null;
  /** 総支給（額面）＝ pay.gross + 指名バック + 回数券バック + 調整額 */
  gross: number;
  /** 控除（雇用保険・社保・源泉）と差引支給額 */
  deduction: DeductionResult;
  /** 給与の対象者か（実働も本数も無ければ false ＝ 一覧から除外してよい） */
  hasPayroll: boolean;
}

/**
 * スタッフ1名の月次給与を計算する。
 *
 * 総支給 = 基本給 + 残業割増 + 深夜割増 + 交通費 + 指名バック + 回数券バック
 * 差引支給 = 総支給 − 雇用保険 − 社会保険 − 源泉所得税
 */
export function computeStaffPayroll(input: StaffPayrollInput): StaffPayrollResult {
  const { staff, records, nominationCount, kaisukenCount, taxOverride } = input;
  const adj = input.adjustment ?? null;
  const adjustment = Math.round(adj?.amount ?? 0);

  const pay = computePayroll(
    records,
    staff.hourly_wage,
    staff.commute_allowance ?? 0,
    staff.commute_distance_km ?? 0
  );

  const nominationBack = NOMINATION_BACK_RATE * nominationCount;
  const kaisukenBackYen = kaisukenBack(kaisukenCount);
  // 調整額（立替精算・臨時手当・貸付返済など）は総支給の一部として足し引きする。
  // 負の調整で総支給がマイナスになると保険料計算が壊れるため0で止める。
  const gross = Math.max(0, pay.gross + nominationBack + kaisukenBackYen + adjustment);

  const deduction = computeDeductions({
    gross,
    // 交通費は非課税なので課税対象から除外する
    commute: pay.commute,
    taxColumn: staff.tax_column ?? "otsu",
    dependents: staff.dependents_count ?? 0,
    empInsuranceEnrolled: staff.emp_insurance_enrolled ?? true,
    shahoEnrolled: staff.shaho_enrolled ?? false,
    kaigoApplicable: staff.kaigo_applicable ?? false,
    smrOfficial: staff.smr_official ?? null,
    // 非課税の調整（立替金の精算など）は交通費と同じく課税対象から外す。
    // 控除側（負）の非課税は課税対象を増やしてしまうため対象外にする。
    nonTaxable: adj && !adj.taxable && adjustment > 0 ? adjustment : 0,
    taxOverride,
  });

  return {
    pay,
    nominationBack,
    kaisukenBackYen,
    adjustment,
    adjustmentLabel: adj?.label?.trim() ? adj.label.trim() : null,
    gross,
    deduction,
    hasPayroll:
      pay.workedMin > 0 || pay.openCount > 0 || nominationCount > 0 || kaisukenCount > 0 || adjustment !== 0,
  };
}

/** 打刻レコードを staff_id ごとにまとめる（各呼び出し側で書かれていた前処理）。 */
export function groupRecordsByStaff<T extends { staff_id: string }>(
  records: T[]
): Map<string, T[]> {
  const byStaff = new Map<string, T[]>();
  for (const r of records) {
    if (!byStaff.has(r.staff_id)) byStaff.set(r.staff_id, []);
    byStaff.get(r.staff_id)!.push(r);
  }
  return byStaff;
}
