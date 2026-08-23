import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, ticketCount, tallyVisitCsv } from "@/lib/fc-hq/visits-csv";

const HEAD =
  "来店日,顧客名,顧客ID,性別,年代,担当,来店種別,来店経路,指名,コース,延長,次回予約,回数券購入,指名チケット,備考,施術売上,回数券売上,指名売上,合計売上";

function row(v: Partial<Record<string, string>>): string {
  const cols = HEAD.split(",");
  // 値にカンマを含む場合（金額のカンマ区切り）は引用符で囲む
  return cols.map((c) => (v[c] ?? "")).map((x) => (x.includes(",") ? `"${x}"` : x)).join(",");
}

test("parseCsv: BOM・CRLF・引用符内のカンマと改行", () => {
  const rows = parseCsv('﻿a,b,c\r\n1,"x,y","2\n3"\r\n');
  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["1", "x,y", "2\n3"],
  ]);
});

test("parseCsv: 二重引用符のエスケープと空行スキップ", () => {
  const rows = parseCsv('a,b\n"言""葉",2\n\n\n3,4\n');
  assert.deepEqual(rows, [
    ["a", "b"],
    ['言"葉', "2"],
    ["3", "4"],
  ]);
});

test("ticketCount: 券種から回数を取り出す", () => {
  assert.equal(ticketCount("3回券(60分)"), 3);
  assert.equal(ticketCount("10回券(90分)"), 10);
  assert.equal(ticketCount(""), 0);
  assert.equal(ticketCount(undefined), 0);
  assert.equal(ticketCount("回数券"), 0);
});

test("回数券は券の回数ではなく1行=1本で数える", () => {
  const csv = [
    HEAD,
    row({ 来店日: "2026-07-01", 担当: "AINA", 来店種別: "新規", 回数券購入: "10回券(90分)", 回数券売上: "158400" }),
    row({ 来店日: "2026-07-02", 担当: "AINA", 来店種別: "新規", 回数券購入: "3回券(60分)", 回数券売上: "39600" }),
  ].join("\r\n");
  const r = tallyVisitCsv(csv, "2026-07");
  assert.equal(r.totalKaisuken, 2);
  assert.equal(r.tallies[0].kaisuken, 2);
  assert.equal(r.tallies[0].kaisukenYen, 198000);
});

test("更新（ラスト1枚／途中更新）も本数に含める", () => {
  const csv = [
    HEAD,
    row({ 来店日: "2026-07-03", 担当: "KAYO", 来店種別: "ラスト1枚／途中更新", 回数券購入: "3回券(90分)" }),
    row({ 来店日: "2026-07-04", 担当: "KAYO", 来店種別: "チケ消化中" }),
  ].join("\n");
  const r = tallyVisitCsv(csv, "2026-07");
  assert.equal(r.totalKaisuken, 1);
  assert.deepEqual(r.kaisukenByKind, { "ラスト1枚／途中更新": 1 });
});

test("対象月以外は除外し、CSVに含まれる月を返す", () => {
  const csv = [
    HEAD,
    row({ 来店日: "2026-06-30", 担当: "AINA", 来店種別: "新規", 回数券購入: "3回券(60分)" }),
    row({ 来店日: "2026-07-01", 担当: "AINA", 来店種別: "新規", 回数券購入: "3回券(60分)" }),
    row({ 来店日: "2026-08-01", 担当: "AINA", 来店種別: "新規" }),
  ].join("\n");
  const r = tallyVisitCsv(csv, "2026-07");
  assert.equal(r.monthRows, 1);
  assert.equal(r.totalRows, 3);
  assert.equal(r.totalKaisuken, 1);
  assert.deepEqual(r.monthsInCsv, ["2026-06", "2026-07", "2026-08"]);
});

test("回数券0本の担当も集計に残る（0で上書きするため）", () => {
  const csv = [
    HEAD,
    row({ 来店日: "2026-07-01", 担当: "AINA", 来店種別: "新規", 回数券購入: "3回券(60分)" }),
    row({ 来店日: "2026-07-01", 担当: "KIYO", 来店種別: "新規" }),
  ].join("\n");
  const r = tallyVisitCsv(csv, "2026-07");
  assert.deepEqual(
    r.tallies.map((t) => [t.staff, t.kaisuken]),
    [
      ["AINA", 1],
      ["KIYO", 0],
    ]
  );
  // 新規の接客数と成約数
  assert.equal(r.tallies[0].newVisits, 1);
  assert.equal(r.tallies[0].newWithTicket, 1);
  assert.equal(r.tallies[1].newVisits, 1);
  assert.equal(r.tallies[1].newWithTicket, 0);
});

test("指名本数は指名売上÷3,300", () => {
  const csv = [
    HEAD,
    row({ 来店日: "2026-07-01", 担当: "AINA", 来店種別: "新規", 指名売上: "6,600" }),
  ].join("\n");
  assert.equal(tallyVisitCsv(csv, "2026-07").tallies[0].nomination, 2);
});

test("必須列がないCSVはエラー", () => {
  assert.throws(() => tallyVisitCsv("来店日,担当\n2026-07-01,AINA", "2026-07"), /列が見つかりません/);
});

test("空のCSVは0件で返す", () => {
  const r = tallyVisitCsv("", "2026-07");
  assert.equal(r.monthRows, 0);
  assert.deepEqual(r.tallies, []);
});
