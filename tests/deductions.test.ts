// =====================================================================
// 控除計算（computeDeductions）と源泉税額表の現行動作を固定するテスト
// =====================================================================
// 2026年9月からの新制度（社保の翌月徴収へ移行など）を入れる前に、
// 現行の控除計算を固定しておく。8月以前の明細が変わらないことの担保。
// =====================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeDeductions,
  standardMonthlyRemuneration,
  withholdingTax,
  EMP_INSURANCE_RATE,
  KENPO_RATE,
  KAIGO_RATE,
  KOSEI_NENKIN_RATE,
} from "@/lib/deductions";
import { monthlyTaxKou, monthlyTaxOtsu } from "@/lib/tax-table-r8";

const base = {
  taxColumn: "otsu" as const,
  dependents: 0,
  empInsuranceEnrolled: true,
  shahoEnrolled: false,
  kaigoApplicable: false,
  taxOverride: null,
};

describe("雇用保険", () => {
  test("総支給×0.5%（端数は50銭以下切捨・超切上）", () => {
    assert.equal(EMP_INSURANCE_RATE, 0.005);
    // 73,610 × 0.005 = 368.05 → 368
    const r = computeDeductions({ ...base, gross: 73610, commute: 2100 });
    assert.equal(r.empInsurance, 368);
  });

  test("加入していなければ0", () => {
    const r = computeDeductions({
      ...base,
      gross: 200000,
      commute: 0,
      empInsuranceEnrolled: false,
    });
    assert.equal(r.empInsurance, 0);
  });
});

describe("社会保険（健保・厚年）", () => {
  test("未加入なら健保・厚年ともに0", () => {
    const r = computeDeductions({ ...base, gross: 244307, commute: 6840 });
    assert.equal(r.healthInsurance, 0);
    assert.equal(r.pension, 0);
    assert.equal(r.smr, null);
  });

  test("加入なら標準報酬月額×料率÷2（労使折半）", () => {
    // 2026年7月のAINA実績: 総支給244,307 → 標準報酬240,000
    const r = computeDeductions({
      ...base,
      gross: 244307,
      commute: 6840,
      taxColumn: "kou",
      shahoEnrolled: true,
    });
    assert.equal(r.smr, 240000);
    assert.equal(r.healthInsurance, 11760, "240,000×9.80%÷2（令和8年度・岐阜）");
    assert.equal(r.pension, 21960, "240,000×18.3%÷2");
    assert.equal(r.socialTotal, r.healthInsurance + r.pension + r.empInsurance);
  });

  test("介護保険（40〜64歳）は健保料率に上乗せ", () => {
    const without = computeDeductions({
      ...base,
      gross: 244307,
      commute: 6840,
      shahoEnrolled: true,
    });
    const withKaigo = computeDeductions({
      ...base,
      gross: 244307,
      commute: 6840,
      shahoEnrolled: true,
      kaigoApplicable: true,
    });
    assert.ok(withKaigo.healthInsurance > without.healthInsurance);
    assert.equal(
      withKaigo.healthInsurance,
      Math.round((240000 * (KENPO_RATE + KAIGO_RATE)) / 2)
    );
  });

  test("料率の現行値（年度改定時はここが変わる）", () => {
    // 協会けんぽは毎年3月分（4月納付分）から改定。都道府県ごとに異なる。
    assert.equal(KENPO_RATE, 0.098, "健保 9.80%（令和8年度・岐阜県）");
    assert.equal(KAIGO_RATE, 0.0159, "介護 1.59%（令和8年度の告示に要確認）");
    assert.equal(KOSEI_NENKIN_RATE, 0.183, "厚年 18.3%（法定固定）");
  });
});

describe("標準報酬月額", () => {
  test("報酬月額から等級を決める", () => {
    assert.equal(standardMonthlyRemuneration(0), 58000);
    assert.equal(standardMonthlyRemuneration(200000), 200000);
    assert.equal(standardMonthlyRemuneration(244307), 240000);
    assert.equal(standardMonthlyRemuneration(193210), 190000);
  });

  test("厚年は88,000〜650,000にクランプされる", () => {
    const low = computeDeductions({
      ...base,
      gross: 50000,
      commute: 0,
      shahoEnrolled: true,
    });
    assert.equal(low.smr, 58000, "健保の標準報酬は58,000");
    assert.equal(low.pension, Math.round((88000 * KOSEI_NENKIN_RATE) / 2), "厚年は下限88,000で計算");
  });
});

describe("課税対象額", () => {
  test("総支給 − 非課税交通費 − 社会保険料", () => {
    const r = computeDeductions({ ...base, gross: 73610, commute: 2100 });
    assert.equal(r.taxableBase, 73610 - 2100 - r.empInsurance); // 71,142
  });

  test("マイナスにはならない", () => {
    const r = computeDeductions({ ...base, gross: 1000, commute: 5000 });
    assert.equal(r.taxableBase, 0);
  });
});

describe("源泉所得税（令和8年分 月額表）", () => {
  test("乙欄は105,000円未満なら3.063%（1円未満切捨）", () => {
    assert.equal(monthlyTaxOtsu(71142), Math.floor(71142 * 0.03063)); // 2179
    assert.equal(monthlyTaxOtsu(104999), Math.floor(104999 * 0.03063));
  });

  test("乙欄は105,000円以上なら税額表の乙欄", () => {
    assert.equal(monthlyTaxOtsu(105000), 3800);
    assert.equal(monthlyTaxOtsu(193500), 17600);
  });

  test("甲欄は105,000円未満なら0円", () => {
    assert.equal(monthlyTaxKou(104999, 0), 0);
  });

  test("甲欄は扶養人数で税額が変わる", () => {
    assert.equal(monthlyTaxKou(193500, 0), 4120);
    assert.equal(monthlyTaxKou(193500, 1), 2510);
    assert.equal(monthlyTaxKou(193500, 2), 890);
    assert.equal(monthlyTaxKou(193500, 3), 0);
  });

  test("扶養7人超は1人につき1,610円を控除", () => {
    assert.equal(monthlyTaxKou(483000, 7), 4090);
    assert.equal(monthlyTaxKou(483000, 8), 4090 - 1610);
  });

  test("740,000円以上はアンカー税額＋超過分×率", () => {
    assert.equal(monthlyTaxKou(740000, 0), 71680);
    assert.equal(monthlyTaxKou(790000, 0), 81890);
    assert.equal(monthlyTaxOtsu(740000), 259200);
  });

  test("withholdingTax は税区分で振り分ける", () => {
    assert.equal(withholdingTax(193500, "kou", 0), monthlyTaxKou(193500, 0));
    assert.equal(withholdingTax(193500, "otsu", 0), monthlyTaxOtsu(193500));
    assert.equal(withholdingTax(0, "kou", 0), 0);
  });
});

describe("源泉の手入力（override）", () => {
  test("手入力があれば自動計算より優先する", () => {
    const r = computeDeductions({ ...base, gross: 200000, commute: 0, taxOverride: 12345 });
    assert.equal(r.incomeTax, 12345);
    assert.ok(r.incomeTaxAuto !== 12345, "自動計算値は別途保持される");
  });

  test("手入力がなければ自動計算値を使う", () => {
    const r = computeDeductions({ ...base, gross: 200000, commute: 0 });
    assert.equal(r.incomeTax, r.incomeTaxAuto);
  });
});

describe("差引支給額（手取り）", () => {
  test("総支給 − 社会保険料合計 − 源泉所得税", () => {
    const r = computeDeductions({ ...base, gross: 73610, commute: 2100 });
    assert.equal(r.net, 73610 - r.socialTotal - r.incomeTax);
  });

  test("2026年7月 KIYO の実績と一致する（乙欄・社保なし）", () => {
    // 明細PDF: 総支給71,887 / 雇用保険359 / 所得税2,139 / 差引69,389
    const r = computeDeductions({
      ...base,
      gross: 71887,
      commute: 1680,
      taxColumn: "otsu",
    });
    assert.equal(r.empInsurance, 359);
    assert.equal(r.taxableBase, 69848);
    assert.equal(r.incomeTax, 2139);
    assert.equal(r.net, 69389);
  });

  test("2026年7月 DAYAN の実績と一致する（甲欄・社保なし）", () => {
    // 明細PDF: 総支給188,496 / 雇用保険942 / 所得税3,910 / 差引183,644
    const r = computeDeductions({
      ...base,
      gross: 188496,
      commute: 510,
      taxColumn: "kou",
    });
    assert.equal(r.empInsurance, 942);
    assert.equal(r.taxableBase, 187044);
    assert.equal(r.incomeTax, 3910);
    assert.equal(r.net, 183644);
  });

  test("2026年7月 AINA の実績と一致する（甲欄・社保なし）", () => {
    // 社会保険の加入は2026年8月分から。7月分は健保・厚年ともに控除なしで支払った。
    // 2026-08-14 にしょうしんへ送った全銀ファイルの実額が ¥237,405。
    const r = computeDeductions({
      ...base,
      gross: 244307,
      commute: 6840,
      taxColumn: "kou",
      shahoEnrolled: false,
    });
    assert.equal(r.healthInsurance, 0);
    assert.equal(r.pension, 0);
    assert.equal(r.empInsurance, 1222);
    assert.equal(r.taxableBase, 236245);
    assert.equal(r.incomeTax, 5680);
    assert.equal(r.net, 237405, "全銀ファイルの振込額と一致すること");
  });
});

describe("標準報酬月額の正式決定額（年金機構の通知書）", () => {
  // 2026-08-10付「資格取得確認および標準報酬決定通知書」の額
  const base = {
    commute: 0, taxColumn: "otsu" as const, dependents: 0,
    empInsuranceEnrolled: false, shahoEnrolled: true, kaigoApplicable: false, taxOverride: 0,
  };

  test("正式決定額があれば当月報酬に関係なくその額で計算する", () => {
    // 総支給が上下しても保険料は変わらない（標準報酬月額は固定のため）
    const a = computeDeductions({ ...base, gross: 250000, smrOfficial: 300000 });
    const b = computeDeductions({ ...base, gross: 340000, smrOfficial: 300000 });
    assert.equal(a.smr, 300000);
    assert.equal(b.smr, 300000);
    assert.equal(a.socialTotal, b.socialTotal);
  });

  test("紙坂香代 標準報酬240千円 → 健保11,760・厚年21,960", () => {
    const d = computeDeductions({ ...base, gross: 220000, smrOfficial: 240000 });
    assert.equal(d.healthInsurance, 11760);
    assert.equal(d.pension, 21960);
    assert.equal(d.socialTotal, 33720);
  });

  test("橋本美佑香・福田愛奈 標準報酬300千円 → 健保14,700・厚年27,450", () => {
    const d = computeDeductions({ ...base, gross: 270000, smrOfficial: 300000 });
    assert.equal(d.healthInsurance, 14700);
    assert.equal(d.pension, 27450);
    assert.equal(d.socialTotal, 42150);
  });

  test("未設定なら従来どおり当月報酬から推計する（後方互換）", () => {
    const auto = computeDeductions({ ...base, gross: 270000 });
    const nullish = computeDeductions({ ...base, gross: 270000, smrOfficial: null });
    assert.equal(auto.smr, 280000, "推計は等級表どおり");
    assert.equal(nullish.smr, auto.smr);
    assert.equal(nullish.socialTotal, auto.socialTotal);
  });

  test("社保未加入なら正式決定額があっても控除しない", () => {
    const d = computeDeductions({ ...base, gross: 270000, shahoEnrolled: false, smrOfficial: 300000 });
    assert.equal(d.smr, null);
    assert.equal(d.socialTotal, 0);
  });
});
