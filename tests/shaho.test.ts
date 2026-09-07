import test from "node:test";
import assert from "node:assert/strict";
import { shahoAppliesTo, shahoStatusLabel, monthEnd } from "@/lib/shaho";

test("月末日を返す（うるう年も）", () => {
  assert.equal(monthEnd("2026-08"), "2026-08-31");
  assert.equal(monthEnd("2026-09"), "2026-09-30");
  assert.equal(monthEnd("2026-02"), "2026-02-28");
  assert.equal(monthEnd("2028-02"), "2028-02-29");
});

test("資格取得日の月から保険料が発生する", () => {
  const p = { enrolledOn: "2026-10-01", leftOn: null };
  assert.equal(shahoAppliesTo("2026-08", p), false);
  assert.equal(shahoAppliesTo("2026-09", p), false);
  assert.equal(shahoAppliesTo("2026-10", p), true);
  assert.equal(shahoAppliesTo("2026-11", p), true);
});

test("月の途中で取得してもその月から発生する", () => {
  const p = { enrolledOn: "2026-10-20", leftOn: null };
  assert.equal(shahoAppliesTo("2026-09", p), false);
  assert.equal(shahoAppliesTo("2026-10", p), true);
});

test("喪失日の属する月の前月まで発生する（10/31退職＝喪失11/1）", () => {
  const p = { enrolledOn: "2026-04-01", leftOn: "2026-11-01" };
  assert.equal(shahoAppliesTo("2026-10", p), true); // 10月分まで発生
  assert.equal(shahoAppliesTo("2026-11", p), false);
});

test("月の途中で喪失したらその月は発生しない", () => {
  const p = { enrolledOn: "2026-04-01", leftOn: "2026-11-15" };
  assert.equal(shahoAppliesTo("2026-10", p), true);
  assert.equal(shahoAppliesTo("2026-11", p), false); // 11/30時点で資格が無い
});

test("日付が未設定なら旧フラグで判定（後方互換）", () => {
  assert.equal(shahoAppliesTo("2026-08", { enrolledFlag: true }), true);
  assert.equal(shahoAppliesTo("2026-08", { enrolledFlag: false }), false);
  assert.equal(shahoAppliesTo("2026-08", {}), false);
  // 日付が入っていればフラグは無視される
  assert.equal(shahoAppliesTo("2026-08", { enrolledOn: "2026-10-01", enrolledFlag: true }), false);
  assert.equal(shahoAppliesTo("2026-10", { enrolledOn: "2026-10-01", enrolledFlag: false }), true);
});

test("取得日が無く喪失日だけなら、喪失前は加入していたとみなす", () => {
  const p = { leftOn: "2026-09-01" };
  assert.equal(shahoAppliesTo("2026-07", p), true);
  assert.equal(shahoAppliesTo("2026-08", p), true);
  assert.equal(shahoAppliesTo("2026-09", p), false);
});

test("表示ラベル", () => {
  assert.equal(shahoStatusLabel("2026-10", { enrolledOn: "2026-10-01" }), "加入中");
  assert.equal(shahoStatusLabel("2026-08", { enrolledOn: "2026-10-01" }), "10月から加入");
  assert.equal(shahoStatusLabel("2026-11", { enrolledOn: "2026-04-01", leftOn: "2026-11-01" }), "資格喪失");
  assert.equal(shahoStatusLabel("2026-08", { enrolledFlag: false }), "未加入");
});
