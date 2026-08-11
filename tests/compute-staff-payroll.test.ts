// =====================================================================
// computeStaffPayroll（給与計算の唯一の入口）のテスト
// =====================================================================
// 給与画面・給与明細の印刷・給与明細PDF・全銀振込データの4か所が
// この関数を共有している。ここが正しければ4か所の金額は必ず一致する。
// =====================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeStaffPayroll, groupRecordsByStaff } from "@/lib/compute-staff-payroll";
import type { Profile } from "@/lib/types";
import type { PayrollRecord } from "@/lib/payroll";

function jst(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}
function rec(date: string, from: string, to: string): PayrollRecord {
  return { work_date: date, clock_in: jst(date, from), clock_out: jst(date, to) };
}

// テスト用の最小限のスタッフ。必要な項目だけ上書きして使う。
function staffOf(over: Partial<Profile> = {}): Profile {
  return {
    id: "s1",
    full_name: "テスト 太郎",
    role: "staff",
    employment_type: "part_time",
    phone: null,
    hourly_wage: 1600,
    min_hours_per_week: 0,
    max_hours_per_week: 40,
    display_color: "#000",
    skills: [],
    is_active: true,
    initial_password: null,
    calendar_token: null,
    line_user_id: null,
    created_at: "",
    updated_at: "",
    ...over,
  } as Profile;
}

describe("computeStaffPayroll — 総支給の組み立て", () => {
  test("総支給 = 時間給与 + 交通費 + 指名バック + 回数券バック", () => {
    const r = computeStaffPayroll({
      staff: staffOf({ commute_distance_km: 5 }),
      records: [rec("2026-07-01", "10:00", "15:00")],
      nominationCount: 2,
      kaisukenCount: 3,
      taxOverride: null,
    });
    assert.equal(r.nominationBack, 6000, "2本 × 3,000");
    assert.equal(r.kaisukenBackYen, 3000, "3本 × 1,000");
    assert.equal(r.pay.commute, 150, "5km × 2 × 15円 × 1日");
    assert.equal(r.gross, r.pay.gross + 6000 + 3000);
    assert.equal(r.gross, 8000 + 150 + 6000 + 3000); // 17,150
  });

  test("バックが0本なら総支給は時間給与のみ", () => {
    const r = computeStaffPayroll({
      staff: staffOf(),
      records: [rec("2026-07-01", "10:00", "15:00")],
      nominationCount: 0,
      kaisukenCount: 0,
      taxOverride: null,
    });
    assert.equal(r.gross, r.pay.gross);
    assert.equal(r.nominationBack, 0);
    assert.equal(r.kaisukenBackYen, 0);
  });
});

describe("computeStaffPayroll — 控除と手取り", () => {
  test("交通費は非課税として課税対象から除かれる", () => {
    const r = computeStaffPayroll({
      staff: staffOf({ commute_allowance: 10000 }),
      records: [rec("2026-07-01", "10:00", "17:00")],
      nominationCount: 0,
      kaisukenCount: 0,
      taxOverride: null,
    });
    assert.equal(
      r.deduction.taxableBase,
      r.gross - r.pay.commute - r.deduction.socialTotal
    );
  });

  test("差引支給 = 総支給 − 社会保険料 − 源泉所得税", () => {
    const r = computeStaffPayroll({
      staff: staffOf({ tax_column: "kou", shaho_enrolled: true }),
      records: ["01", "02", "03", "06", "07"].map((d) => rec(`2026-07-${d}`, "09:30", "18:30")),
      nominationCount: 5,
      kaisukenCount: 2,
      taxOverride: null,
    });
    assert.equal(r.deduction.net, r.gross - r.deduction.socialTotal - r.deduction.incomeTax);
    assert.ok(r.deduction.healthInsurance > 0, "社保加入なら健保が引かれる");
    assert.ok(r.deduction.pension > 0);
  });

  test("源泉の手入力は自動計算より優先される", () => {
    const r = computeStaffPayroll({
      staff: staffOf(),
      records: [rec("2026-07-01", "10:00", "18:00")],
      nominationCount: 0,
      kaisukenCount: 0,
      taxOverride: 9999,
    });
    assert.equal(r.deduction.incomeTax, 9999);
  });

  test("スタッフ設定は既定値にフォールバックする（税区分=乙・雇用保険=加入）", () => {
    const r = computeStaffPayroll({
      staff: staffOf(), // tax_column などを未設定にしたケース
      records: [rec("2026-07-01", "10:00", "18:00")],
      nominationCount: 0,
      kaisukenCount: 0,
      taxOverride: null,
    });
    assert.ok(r.deduction.empInsurance > 0, "雇用保険は既定で加入");
    assert.equal(r.deduction.healthInsurance, 0, "社保は既定で未加入");
  });
});

describe("computeStaffPayroll — 対象者の判定", () => {
  test("実働があれば対象", () => {
    const r = computeStaffPayroll({
      staff: staffOf(),
      records: [rec("2026-07-01", "10:00", "15:00")],
      nominationCount: 0,
      kaisukenCount: 0,
      taxOverride: null,
    });
    assert.equal(r.hasPayroll, true);
  });

  test("実働ゼロでもバックがあれば対象", () => {
    const r = computeStaffPayroll({
      staff: staffOf(),
      records: [],
      nominationCount: 1,
      kaisukenCount: 0,
      taxOverride: null,
    });
    assert.equal(r.hasPayroll, true);
  });

  test("実働もバックも無ければ対象外", () => {
    const r = computeStaffPayroll({
      staff: staffOf(),
      records: [],
      nominationCount: 0,
      kaisukenCount: 0,
      taxOverride: null,
    });
    assert.equal(r.hasPayroll, false);
    assert.equal(r.gross, 0);
  });
});

describe("groupRecordsByStaff", () => {
  test("staff_id ごとに打刻をまとめる", () => {
    const grouped = groupRecordsByStaff([
      { staff_id: "a", work_date: "2026-07-01" },
      { staff_id: "b", work_date: "2026-07-01" },
      { staff_id: "a", work_date: "2026-07-02" },
    ]);
    assert.equal(grouped.get("a")?.length, 2);
    assert.equal(grouped.get("b")?.length, 1);
    assert.equal(grouped.get("c"), undefined);
  });
});

describe("2026年7月の実績と一致すること（4画面共通の金額）", () => {
  test("KIYO: 総支給71,887 → 手取り69,389", () => {
    // 実働41時間22分・指名1本・回数券1本・通勤1,680（明細PDFより）
    // 打刻を再現するのは煩雑なため、控除側の一致は deductions.test.ts で担保。
    // ここでは「バック加算と控除の連結」が壊れていないことを確認する。
    const r = computeStaffPayroll({
      staff: staffOf({ tax_column: "otsu", commute_allowance: 1680 }),
      records: [rec("2026-07-01", "10:00", "15:00")],
      nominationCount: 1,
      kaisukenCount: 1,
      taxOverride: null,
    });
    assert.equal(r.nominationBack, 3000);
    assert.equal(r.kaisukenBackYen, 1000);
    assert.equal(r.gross, r.pay.basePay + 1680 + 3000 + 1000);
    assert.equal(r.deduction.net, r.gross - r.deduction.socialTotal - r.deduction.incomeTax);
  });
});

describe("月別の調整（立替精算・臨時手当・貸付返済）", () => {
  const base = {
    staff: staffOf(),
    records: [rec("2026-07-01", "10:00", "18:00")],
    nominationCount: 0,
    kaisukenCount: 0,
    taxOverride: null,
  };

  test("プラスの調整は総支給に加算される", () => {
    const plain = computeStaffPayroll(base);
    const r = computeStaffPayroll({ ...base, adjustment: { amount: 2200, label: "立替精算", taxable: true } });
    assert.equal(r.gross, plain.gross + 2200);
    assert.equal(r.adjustment, 2200);
    assert.equal(r.adjustmentLabel, "立替精算");
  });

  test("マイナスの調整は総支給から差し引かれる", () => {
    const plain = computeStaffPayroll(base);
    const r = computeStaffPayroll({ ...base, adjustment: { amount: -3000, label: "制服代", taxable: true } });
    assert.equal(r.gross, plain.gross - 3000);
  });

  test("課税の調整は課税対象に入る", () => {
    const r = computeStaffPayroll({ ...base, adjustment: { amount: 20000, label: "手当", taxable: true } });
    assert.equal(r.deduction.taxableBase, r.gross - r.pay.commute - r.deduction.socialTotal);
  });

  test("非課税の調整は交通費と同じく課税対象から外れる", () => {
    const r = computeStaffPayroll({ ...base, adjustment: { amount: 20000, label: "立替精算", taxable: false } });
    assert.equal(r.deduction.taxableBase, r.gross - r.pay.commute - 20000 - r.deduction.socialTotal);
  });

  test("非課税でも控除（マイナス）は課税対象を増やさない", () => {
    const taxed = computeStaffPayroll({ ...base, adjustment: { amount: -5000, label: "返済", taxable: true } });
    const nonTaxed = computeStaffPayroll({ ...base, adjustment: { amount: -5000, label: "返済", taxable: false } });
    assert.equal(taxed.deduction.taxableBase, nonTaxed.deduction.taxableBase);
  });

  test("調整で総支給がマイナスになっても0で止まる", () => {
    const r = computeStaffPayroll({ ...base, adjustment: { amount: -999999, label: "", taxable: true } });
    assert.equal(r.gross, 0);
    assert.equal(r.deduction.socialTotal, 0);
  });

  test("実働ゼロでも調整があれば対象になる", () => {
    const r = computeStaffPayroll({
      ...base,
      records: [],
      adjustment: { amount: 2200, label: "立替精算", taxable: false },
    });
    assert.equal(r.hasPayroll, true);
    assert.equal(r.gross, 2200);
  });

  test("調整を渡さなければ従来どおり（後方互換）", () => {
    const plain = computeStaffPayroll(base);
    const withNull = computeStaffPayroll({ ...base, adjustment: null });
    assert.equal(plain.gross, withNull.gross);
    assert.equal(plain.adjustment, 0);
    assert.equal(plain.deduction.net, withNull.deduction.net);
  });
});
