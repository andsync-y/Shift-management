import test from "node:test";
import assert from "node:assert/strict";
import { buildNameIndex, matchStaffCounts, ticketCountsFrom } from "@/lib/fc-kpi/match";
import { parseNameCountLines, parseTicketSaleLines } from "@/lib/fc-kpi/types";

const STAFF = [
  { id: "s1", full_name: "福田 愛奈", display_name: "AINA" },
  { id: "s2", full_name: "紙坂 加代", display_name: "KAYO" },
  { id: "s3", full_name: "山田 花子", display_name: null },
];

test("表示名と氏名のどちらでも引ける", () => {
  const idx = buildNameIndex(STAFF);
  assert.equal(idx.get("AINA"), "s1");
  assert.equal(idx.get("福田 愛奈"), "s1");
  assert.equal(idx.get("山田 花子"), "s3");
  assert.equal(idx.get("KIYO"), undefined);
});

test("表示名が他人の氏名と衝突しても表示名が優先される", () => {
  const idx = buildNameIndex([
    { id: "a", full_name: "田中 一郎", display_name: "HANA" },
    { id: "b", full_name: "HANA", display_name: null },
  ]);
  assert.equal(idx.get("HANA"), "a");
});

test("未一致の担当は件数つきで返る（黙って0にしない）", () => {
  const idx = buildNameIndex(STAFF);
  const r = matchStaffCounts(idx, [
    { name: "AINA", count: 8 },
    { name: "KIYO", count: 1 },
    { name: "", count: 5 },
  ], "本");
  assert.deepEqual(r.rows, [{ staff_id: "s1", count: 8 }]);
  assert.deepEqual(r.unmatched, ["KIYO(1本)"]);
  assert.equal(r.total, 9); // 未一致分も合計には含める
});

test("回数券の本数は 新規＋更新", () => {
  const r = ticketCountsFrom([
    { name: "AINA", newCount: 5, renewalCount: 3 },
    { name: "KAYO", newCount: 2, renewalCount: 0 },
  ]);
  assert.deepEqual(r.entries, [
    { name: "AINA", count: 8 },
    { name: "KAYO", count: 2 },
  ]);
  assert.equal(r.renewalMissing, false);
});

test("更新販売数が取れていないと renewalMissing が立つ", () => {
  const r = ticketCountsFrom([
    { name: "AINA", newCount: 5, renewalCount: null },
    { name: "KAYO", newCount: 2, renewalCount: 1 },
  ]);
  assert.deepEqual(r.entries, [
    { name: "AINA", count: 5 },
    { name: "KAYO", count: 3 },
  ]);
  assert.equal(r.renewalMissing, true);
});

test("担当別 回数券の手入力パース（更新の省略は null）", () => {
  assert.deepEqual(parseTicketSaleLines("AINA,5,2\nKAYO,2\n\nHANA,0,0"), [
    { name: "AINA", newCount: 5, renewalCount: 2 },
    { name: "KAYO", newCount: 2, renewalCount: null },
    { name: "HANA", newCount: 0, renewalCount: 0 },
  ]);
});

test("担当別 指名数の手入力パース", () => {
  assert.deepEqual(parseNameCountLines("AINA,12\nKAYO,5\n名前だけ"), [
    { name: "AINA", count: 12 },
    { name: "KAYO", count: 5 },
    { name: "名前だけ", count: 0 },
  ]);
});
