// =====================================================================
// 給与計算（computePayroll）の現行動作を固定するテスト
// =====================================================================
// 目的: 2026年9月からの新給与制度（正社員の日給月給制など）を実装するにあたり、
//       「8月以前の給与を現行ロジックのまま再計算できる」ことを保証する。
//       ここで固定した期待値が変わったら後方互換が壊れたということ。
// 実行: npm test
// =====================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computePayroll,
  kaisukenBack,
  kaisukenBackRate,
  wageForSales,
  hhmm,
  NOMINATION_BACK_RATE,
  COMMUTE_RATE_PER_KM,
  type PayrollRecord,
} from "@/lib/payroll";

// JSTの "YYYY-MM-DD HH:MM" を ISO(UTC) に変換するテスト用ヘルパ
function jst(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}
function rec(date: string, from: string, to: string | null): PayrollRecord {
  return {
    work_date: date,
    clock_in: jst(date, from),
    clock_out: to === null ? null : jst(date, to),
  };
}

describe("computePayroll — 基本の時間集計", () => {
  test("6時間以下は休憩控除なし・実働=拘束", () => {
    const r = computePayroll([rec("2026-07-01", "10:00", "15:00")], 1600);
    assert.equal(r.clockedMin, 300);
    assert.equal(r.breakMin, 0);
    assert.equal(r.workedMin, 300);
    assert.equal(r.basePay, 8000); // 5h × 1600
  });

  test("6時間超8時間以下は休憩45分", () => {
    const r = computePayroll([rec("2026-07-01", "10:00", "17:00")], 1600);
    assert.equal(r.clockedMin, 420);
    assert.equal(r.breakMin, 45);
    assert.equal(r.workedMin, 375);
    assert.equal(r.basePay, 10000); // 375/60*1600
  });

  test("8時間超は休憩60分", () => {
    const r = computePayroll([rec("2026-07-01", "09:00", "18:00")], 1600);
    assert.equal(r.clockedMin, 540);
    assert.equal(r.breakMin, 60);
    assert.equal(r.workedMin, 480);
    assert.equal(r.overtimeMin, 0, "実働ちょうど8hなら残業なし");
  });

  test("1分単位で計算する（丸めない）", () => {
    const r = computePayroll([rec("2026-07-01", "10:00", "15:23")], 1600);
    assert.equal(r.workedMin, 323);
    assert.equal(r.basePay, Math.round((323 / 60) * 1600)); // 8613
  });

  test("退勤打刻がない日は給与に含めず openCount に数える", () => {
    const r = computePayroll(
      [rec("2026-07-01", "10:00", "15:00"), rec("2026-07-02", "10:00", null)],
      1600
    );
    assert.equal(r.openCount, 1);
    assert.equal(r.workedMin, 300, "打刻中の日は実働に入らない");
    assert.equal(r.workedDays, 1);
  });
});

describe("computePayroll — 残業（1日8時間超×1.25）", () => {
  test("実働8時間超の分だけ25%割増が別途つく", () => {
    // 09:00-19:00=600分, 休憩60 → 実働540分(9h) → 残業60分
    const r = computePayroll([rec("2026-07-01", "09:00", "19:00")], 1600);
    assert.equal(r.workedMin, 540);
    assert.equal(r.overtimeMin, 60);
    assert.equal(r.basePay, Math.round((540 / 60) * 1600)); // 全労働×時給
    assert.equal(r.overtimePay, Math.round((60 / 60) * 1600 * 0.25)); // 400
  });

  test("週40時間超の残業は現行仕様では未対応（1日8h超のみ）", () => {
    // 6日×7時間=42時間だが、1日8h以下なので残業0
    const days = ["01", "02", "03", "04", "05", "06"].map((d) =>
      rec(`2026-07-${d}`, "10:00", "17:00")
    );
    const r = computePayroll(days, 1600);
    assert.equal(r.overtimeMin, 0);
  });
});

describe("computePayroll — 深夜（22:00〜翌5:00に+25%）", () => {
  test("22時以降の労働に深夜割増がつく", () => {
    // 18:00-23:00 → 深夜は22:00-23:00の60分
    const r = computePayroll([rec("2026-07-01", "18:00", "23:00")], 1600);
    assert.equal(r.nightMin, 60);
    assert.equal(r.nightPay, Math.round((60 / 60) * 1600 * 0.25)); // 400
  });

  test("深夜を含まない勤務は深夜0", () => {
    const r = computePayroll([rec("2026-07-01", "09:30", "16:30")], 1600);
    assert.equal(r.nightMin, 0);
    assert.equal(r.nightPay, 0);
  });
});

describe("computePayroll — 期間別時給（WAGE_SCHEDULE）", () => {
  test("6/8〜6/19は講習時給1,060円", () => {
    const r = computePayroll([rec("2026-06-10", "10:00", "15:00")], 9999);
    assert.equal(r.basePay, Math.round((300 / 60) * 1060)); // 5300
    assert.equal(r.days[0].wage, 1060);
  });

  test("6/20以降は1,600円", () => {
    const r = computePayroll([rec("2026-06-25", "10:00", "15:00")], 9999);
    assert.equal(r.days[0].wage, 1600);
    assert.equal(r.basePay, 8000);
  });

  test("同じ月でも日付ごとに時給が切り替わる", () => {
    const r = computePayroll(
      [rec("2026-06-10", "10:00", "15:00"), rec("2026-06-25", "10:00", "15:00")],
      9999
    );
    assert.equal(r.basePay, Math.round((300 / 60) * 1060) + 8000);
  });

  test("期間表の範囲外は各自の時給（fallback）を使う", () => {
    const r = computePayroll([rec("2026-05-01", "10:00", "15:00")], 1200);
    assert.equal(r.days[0].wage, 1200);
    assert.equal(r.basePay, 6000);
  });
});

describe("computePayroll — 交通費", () => {
  test("片道距離があれば 片道×2×15円×勤務日数", () => {
    const days = ["01", "02", "03"].map((d) => rec(`2026-07-${d}`, "10:00", "15:00"));
    const r = computePayroll(days, 1600, 0, 5); // 片道5km
    assert.equal(r.workedDays, 3);
    assert.equal(r.commute, 5 * 2 * COMMUTE_RATE_PER_KM * 3); // 450
  });

  test("片道距離が未設定なら月額固定を使う", () => {
    const r = computePayroll([rec("2026-07-01", "10:00", "15:00")], 1600, 8000, 0);
    assert.equal(r.commute, 8000);
  });

  test("総支給は 基本＋残業＋深夜＋交通費（バックは含まない）", () => {
    const r = computePayroll([rec("2026-07-01", "09:00", "19:00")], 1600, 0, 5);
    assert.equal(r.gross, r.basePay + r.overtimePay + r.nightPay + r.commute);
  });
});

describe("バック（指名・回数券）", () => {
  test("指名バックは1本3,000円", () => {
    assert.equal(NOMINATION_BACK_RATE, 3000);
  });

  test("回数券バックは本数連動の段階単価×本数", () => {
    assert.equal(kaisukenBackRate(0), 0);
    assert.equal(kaisukenBackRate(1), 1000);
    assert.equal(kaisukenBackRate(3), 1000);
    assert.equal(kaisukenBackRate(4), 2000);
    assert.equal(kaisukenBackRate(7), 2000);
    assert.equal(kaisukenBackRate(8), 3000);

    assert.equal(kaisukenBack(0), 0);
    assert.equal(kaisukenBack(3), 3000); // 3本×1,000
    assert.equal(kaisukenBack(4), 8000); // 4本×2,000
    assert.equal(kaisukenBack(8), 24000); // 8本×3,000
  });
});

describe("売上連動の時給テーブル（現在は未接続だが仕様として固定）", () => {
  test("80万まではフロア1,600円、以降は段階的に上がる", () => {
    assert.equal(wageForSales(0), 1600);
    assert.equal(wageForSales(800_000), 1600);
    assert.equal(wageForSales(900_000), 1800);
    assert.equal(wageForSales(1_400_000), 2800);
    assert.equal(wageForSales(1_500_000), 3000);
  });
});

describe("表示用ヘルパ", () => {
  test("hhmm は「N時間M分」で表す", () => {
    assert.equal(hhmm(0), "0時間0分");
    assert.equal(hhmm(90), "1時間30分");
    assert.equal(hhmm(3244), "54時間4分");
  });
});

describe("週平均（社保判定の元になる値）", () => {
  test("月〜日の週ごとに集計して平均を出す", () => {
    // 2026-07-01(水)と07-02(木)は同じ週、07-06(月)は次の週
    const r = computePayroll(
      [
        rec("2026-07-01", "10:00", "15:00"), // 300分
        rec("2026-07-02", "10:00", "15:00"), // 300分
        rec("2026-07-06", "10:00", "15:00"), // 300分（別の週）
      ],
      1600
    );
    assert.equal(r.weekCount, 2, "勤務のあった週は2週");
    assert.equal(r.avgWeeklyMin, 450, "(600+300)/2");
  });
});
