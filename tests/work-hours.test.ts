// =====================================================================
// 拘束 ↔ 実働 の共通ルールのテスト
// =====================================================================
// シフト作成と給与計算がこのモジュールを共有している。ここが正しければ、
// 「シフトの合計時間」と「給与明細の実働時間」は同じ数え方になる。
// =====================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  breakMinutesFor,
  netMinutesFor,
  clockedHours,
  netHours,
  capShiftLength,
  shiftLengthLabel,
} from "@/lib/work-hours";

describe("休憩の自動控除", () => {
  test("8時間超は60分", () => {
    assert.equal(breakMinutesFor(481), 60);
    assert.equal(breakMinutesFor(570), 60); // 9.5h
  });
  test("6時間超8時間以下は45分", () => {
    assert.equal(breakMinutesFor(361), 45);
    assert.equal(breakMinutesFor(480), 45); // ちょうど8hは45分（8h「超」ではない）
  });
  test("6時間以下は0分", () => {
    assert.equal(breakMinutesFor(360), 0);
    assert.equal(breakMinutesFor(0), 0);
  });
  test("実働は拘束から休憩を引いた値", () => {
    assert.equal(netMinutesFor(510), 450); // 8.5h勤務 → 実働7.5h
  });
});

describe("シフトの時間換算", () => {
  test("早番 09:30–19:00 は拘束9.5h・実働8.5h", () => {
    assert.equal(clockedHours("09:30", "19:00"), 9.5);
    assert.equal(netHours("09:30", "19:00"), 8.5);
  });
  test("あいなの正社員シフト 09:30–18:00 は拘束8.5h・実働7.5h", () => {
    assert.equal(clockedHours("09:30", "18:00"), 8.5);
    assert.equal(netHours("09:30", "18:00"), 7.5);
  });
  test("短時間シフト 09:30–15:00 は休憩なしで実働5.5h", () => {
    assert.equal(netHours("09:30", "15:00"), 5.5);
  });
});

describe("1日の所定勤務時間でのトリム", () => {
  test("早番は開始を固定して終わりを早める", () => {
    assert.deepEqual(capShiftLength("09:30", "19:00", 8.5), { start: "09:30", end: "18:00" });
  });
  test("遅番（20時以降に終わる）は終わりを固定して開始を遅らせる", () => {
    assert.deepEqual(capShiftLength("12:30", "22:00", 8.5), { start: "13:30", end: "22:00" });
  });
  test("元から所定以下なら変えない", () => {
    assert.deepEqual(capShiftLength("09:30", "15:00", 8.5), { start: "09:30", end: "15:00" });
    assert.deepEqual(capShiftLength("09:30", "18:00", 8.5), { start: "09:30", end: "18:00" });
  });
  test("所定が未設定なら変えない", () => {
    assert.deepEqual(capShiftLength("09:30", "19:00", null), { start: "09:30", end: "19:00" });
    assert.deepEqual(capShiftLength("09:30", "19:00", undefined), { start: "09:30", end: "19:00" });
  });
  test("トリム後の実働が所定どおりになる", () => {
    const b = capShiftLength("12:30", "22:00", 8.5);
    assert.equal(netHours(b.start, b.end), 7.5);
  });
});

describe("表示ラベル", () => {
  test("8.5 → 「8.5h勤務（実働7.5h）」", () => {
    assert.equal(shiftLengthLabel(8.5), "8.5h勤務（実働7.5h）");
  });
});
