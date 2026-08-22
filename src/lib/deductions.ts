// =====================================================================
// 給与控除エンジン（雇用保険・社会保険・源泉所得税）→ 差引支給額（手取り）
// =====================================================================
// 方針:
//  - 雇用保険 / 社保（標準報酬月額×料率）/ 源泉（令和8年分 月額表＝
//    src/lib/tax-table-r8.ts）をすべて自動計算する。
//  - 月次の手入力（income_tax_overrides）があれば源泉はそれを常に優先
//    （税額表にない個別事情の上書き用）。
//  - 控除の端数は本人負担分の通例（50銭以下切捨・50銭超切上）。源泉は1円未満切捨。
// =====================================================================

import { monthlyTaxKou, monthlyTaxOtsu } from "./tax-table-r8";

export type TaxColumn = "kou" | "otsu";

// --- 雇用保険（令和8年度・一般の事業・被保険者負担率）--------------------
// ⚠️ 年度改定あり。毎年4月に厚労省の告示で要確認。
export const EMP_INSURANCE_RATE = 0.005; // 0.5%

// --- 社会保険 料率 -----------------------------------------------------
// ⚠️ 健康保険は協会けんぽ岐阜支部の当年度料率に更新すること（毎年3月改定）。
//    下記は暫定値。shaho_enrolled=false のスタッフには使われない。
// 協会けんぽ 岐阜県支部の料率（労使計）。⚠️ 毎年3月分（4月納付分）から改定される。
// 改定が公表されたら必ずここを更新すること（都道府県ごとに異なる）。
export const KENPO_RATE = 0.098; // 健康保険 9.80%（令和8年度・3月分〜・岐阜県）
export const KAIGO_RATE = 0.0159; // 介護保険 1.59%（40〜64歳・労使計・⚠️令和8年度の告示に要確認）
export const KOSEI_NENKIN_RATE = 0.183; // 厚生年金 18.3%（労使計・法定固定）

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
  nonTaxable?: number; // うち非課税の調整額（立替精算など・課税対象から除外）
  taxColumn: TaxColumn;
  dependents: number; // 扶養親族等の数（甲欄）
  empInsuranceEnrolled: boolean;
  shahoEnrolled: boolean;
  /**
   * 標準報酬月額の正式決定額（年金機構の通知書の額）。
   * 標準報酬月額は資格取得時・定時決定で固定されるため、決まっていれば必ずこれを使う。
   * 未設定（null）のときだけ当月報酬から等級表で推計する（簡易方式）。
   */
  smrOfficial?: number | null;
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
  incomeTaxAuto: number; // 税額表（令和8年分 月額表）による自動計算値
  incomeTax: number; // 適用する源泉（手入力があればそれを優先）
  net: number; // 差引支給額（手取り）
}

// 源泉所得税の自動計算（令和8年分 月額表・甲欄/乙欄）。
export function withholdingTax(taxable: number, column: TaxColumn, dependents: number): number {
  if (taxable <= 0) return 0;
  return column === "otsu" ? monthlyTaxOtsu(taxable) : monthlyTaxKou(taxable, dependents);
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
    // 正式決定額があればそれを使う。無ければ当月報酬から推計（簡易方式）。
    smr = input.smrOfficial && input.smrOfficial > 0
      ? input.smrOfficial
      : standardMonthlyRemuneration(gross);
    const healthRate = KENPO_RATE + (input.kaigoApplicable ? KAIGO_RATE : 0);
    healthInsurance = roundZeni((smr * healthRate) / 2);
    const pensionSmr = Math.min(650000, Math.max(88000, smr));
    pension = roundZeni((pensionSmr * KOSEI_NENKIN_RATE) / 2);
  }

  const socialTotal = empInsurance + healthInsurance + pension;

  // 課税対象 = 総支給 − 非課税交通費 − 非課税の調整 − 社会保険料
  const taxableBase = Math.max(0, gross - commute - (input.nonTaxable ?? 0) - socialTotal);

  const incomeTaxAuto = withholdingTax(taxableBase, input.taxColumn, input.dependents);
  const incomeTax = input.taxOverride ?? incomeTaxAuto;

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
    net,
  };
}

export const TAX_COLUMN_LABELS_JA: Record<TaxColumn, string> = {
  kou: "甲欄（申告書提出済）",
  otsu: "乙欄（他社が本業）",
};
