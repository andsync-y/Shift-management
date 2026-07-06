// =====================================================================
// 給与控除エンジン（雇用保険・社会保険・源泉所得税）→ 差引支給額（手取り）
// =====================================================================
// 方針:
//  - 確実に計算できるものは自動: 雇用保険 / 社保（標準報酬月額×料率）/
//    源泉のうち「乙欄フラット域(3.063%)」「甲欄¥0域」。
//  - 令和8年分 税額表の上位区分は自動計算しない（税額表の検証が必要なため）。
//    その場合は incomeTaxAuto=null を返し、画面の月次手入力（income_tax_overrides）
//    で確定させる。手入力があれば常に優先。
//  - 控除の端数は本人負担分の通例（50銭以下切捨・50銭超切上）。源泉は1円未満切捨。
// =====================================================================

export type TaxColumn = "kou" | "otsu";

// --- 雇用保険（令和8年度・一般の事業・被保険者負担率）--------------------
// ⚠️ 年度改定あり。毎年4月に厚労省の告示で要確認。
export const EMP_INSURANCE_RATE = 0.005; // 0.5%

// --- 社会保険 料率 -----------------------------------------------------
// ⚠️ 健康保険は協会けんぽ岐阜支部の当年度料率に更新すること（毎年3月改定）。
//    下記は暫定値。shaho_enrolled=false のスタッフには使われない。
export const KENPO_RATE = 0.0991; // 健康保険 9.91%（労使計・暫定/要更新）
export const KAIGO_RATE = 0.0159; // 介護保険 1.59%（40〜64歳・労使計・暫定/要更新）
export const KOSEI_NENKIN_RATE = 0.183; // 厚生年金 18.3%（労使計・法定固定）

// --- 源泉所得税（令和8年分）--------------------------------------------
// ⚠️ 令和8年分の税額表（基礎控除等の改正反映）に基づく境界。国税庁の
//    「給与所得の源泉徴収税額表（令和8年分）」で要検証。
export const OTSU_FLAT_RATE = 0.03063; // 乙欄フラット域: 課税対象×3.063%
export const OTSU_FLAT_MAX = 105000; // 乙欄: 課税対象がこの額未満なら3.063%
export const KOU_ZERO_MAX = 105000; // 甲欄・扶養0人: 課税対象がこの額以下なら¥0

// 標準報酬月額（健康保険 全50等級の下限→標準報酬）。厚生年金はこのうち
// 88,000〜650,000 に丸める（法定・安定）。
// 形式: [報酬月額の下限(この額以上), 標準報酬月額]
const SMR_TABLE: [number, number][] = [
  [0, 58000],
  [63000, 68000],
  [73000, 78000],
  [83000, 88000],
  [93000, 98000],
  [101000, 104000],
  [107000, 110000],
  [114000, 118000],
  [122000, 126000],
  [130000, 134000],
  [138000, 142000],
  [146000, 150000],
  [155000, 160000],
  [165000, 170000],
  [175000, 180000],
  [185000, 190000],
  [195000, 200000],
  [210000, 220000],
  [230000, 240000],
  [250000, 260000],
  [270000, 280000],
  [290000, 300000],
  [310000, 320000],
  [330000, 340000],
  [350000, 360000],
  [370000, 380000],
  [395000, 410000],
  [425000, 440000],
  [455000, 470000],
  [485000, 500000],
  [515000, 530000],
  [545000, 560000],
  [575000, 590000],
  [605000, 620000],
  [635000, 650000],
  [665000, 680000],
  [695000, 710000],
  [730000, 750000],
  [770000, 790000],
  [810000, 830000],
  [855000, 880000],
  [905000, 930000],
  [955000, 980000],
  [1005000, 1030000],
  [1055000, 1090000],
  [1115000, 1150000],
  [1175000, 1210000],
  [1235000, 1270000],
  [1295000, 1330000],
  [1355000, 1390000],
];

// 報酬月額（通勤手当込み）→ 標準報酬月額。
// ⚠️ 本来は資格取得時決定・定時決定（4〜6月平均）で等級が固定される。
//    ここでは当月報酬から求める簡易方式（目安）。
export function standardMonthlyRemuneration(monthly: number): number {
  let smr = SMR_TABLE[0][1];
  for (const [lower, s] of SMR_TABLE) {
    if (monthly >= lower) smr = s;
    else break;
  }
  return smr;
}

// 被保険者負担分の端数処理: 50銭以下切捨・50銭超切上（給与から控除する場合の通例）。
function roundZeni(x: number): number {
  const frac = x - Math.floor(x);
  return frac <= 0.5 ? Math.floor(x) : Math.ceil(x);
}

export interface DeductionInput {
  gross: number; // 総支給（額面・交通費含む）
  commute: number; // うち非課税交通費（課税対象から除外）
  taxColumn: TaxColumn;
  dependents: number; // 扶養親族等の数（甲欄）
  empInsuranceEnrolled: boolean;
  shahoEnrolled: boolean;
  kaigoApplicable: boolean;
  taxOverride: number | null; // 源泉の手入力（あれば常に優先）
}

export interface DeductionResult {
  empInsurance: number; // 雇用保険（本人負担）
  healthInsurance: number; // 健康保険（＋介護保険・本人負担）
  pension: number; // 厚生年金（本人負担）
  socialTotal: number; // 控除される保険料の合計
  smr: number | null; // 標準報酬月額（社保加入時のみ）
  taxableBase: number; // 課税対象（非課税交通費・社会保険料を控除後）
  incomeTaxAuto: number | null; // 自動計算できた源泉（不能なら null）
  incomeTax: number; // 適用する源泉（override ?? auto ?? 0）
  taxNeedsInput: boolean; // 自動計算不能かつ手入力なし → 要入力
  net: number; // 差引支給額（手取り）
}

// 源泉所得税の自動計算。確実なゾーンのみ返し、それ以外は null（手入力を促す）。
export function withholdingTax(
  taxable: number,
  column: TaxColumn,
  dependents: number
): number | null {
  if (taxable <= 0) return 0;
  if (column === "otsu") {
    if (taxable < OTSU_FLAT_MAX) return Math.floor(taxable * OTSU_FLAT_RATE);
    return null; // 乙欄の上位区分は税額表で確定（手入力）
  }
  // 甲欄: 扶養0人で課税対象が¥0域なら源泉なし。
  if (dependents === 0 && taxable <= KOU_ZERO_MAX) return 0;
  // 扶養ありは¥0域がさらに広いが、境界は税額表で確定させる（手入力）。
  return null;
}

export function computeDeductions(input: DeductionInput): DeductionResult {
  const { gross, commute } = input;

  // 雇用保険: 総支給（通勤手当含む）× 0.5%
  const empInsurance =
    input.empInsuranceEnrolled && gross > 0 ? roundZeni(gross * EMP_INSURANCE_RATE) : 0;

  // 社会保険: 標準報酬月額 × 料率 ÷ 2（労使折半・本人負担分）
  let healthInsurance = 0;
  let pension = 0;
  let smr: number | null = null;
  if (input.shahoEnrolled && gross > 0) {
    smr = standardMonthlyRemuneration(gross);
    const healthRate = KENPO_RATE + (input.kaigoApplicable ? KAIGO_RATE : 0);
    healthInsurance = roundZeni((smr * healthRate) / 2);
    const pensionSmr = Math.min(650000, Math.max(88000, smr));
    pension = roundZeni((pensionSmr * KOSEI_NENKIN_RATE) / 2);
  }

  const socialTotal = empInsurance + healthInsurance + pension;

  // 課税対象 = 総支給 − 非課税交通費 − 社会保険料
  const taxableBase = Math.max(0, gross - commute - socialTotal);

  const incomeTaxAuto = withholdingTax(taxableBase, input.taxColumn, input.dependents);
  const incomeTax = input.taxOverride ?? incomeTaxAuto ?? 0;
  const taxNeedsInput = input.taxOverride == null && incomeTaxAuto == null;

  const net = gross - socialTotal - incomeTax;

  return {
    empInsurance,
    healthInsurance,
    pension,
    socialTotal,
    smr,
    taxableBase,
    incomeTaxAuto,
    incomeTax,
    taxNeedsInput,
    net,
  };
}

export const TAX_COLUMN_LABELS_JA: Record<TaxColumn, string> = {
  kou: "甲欄（申告書提出済）",
  otsu: "乙欄（他社が本業）",
};
