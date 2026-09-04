import test from "node:test";
import assert from "node:assert/strict";
import {
  tallySalonBoardCsv,
  isKaisukenMenu,
  isNominationTicketMenu,
} from "@/lib/salonboard/accounting-csv";

const HEAD =
  "会計日,会計時間,会計ID,会計区分,区分,ジャンル,カテゴリ,メニュー・店販・割引・サービス・オプション,単価,単価区分,個数,金額,スタッフ,指名,お客様名,お客様番号,お客様名（フリガナ）,予約経路,性別,新規再来";

function row(v: Partial<Record<string, string>>): string {
  return HEAD.split(",")
    .map((c) => v[c] ?? "")
    .map((x) => (x.includes(",") ? `"${x}"` : x))
    .join(",");
}
const r = (o: {
  d?: string; id: string; kubun?: string; menu?: string; qty?: string; amt?: string;
  staff: string; nom?: string; nw?: string;
}) =>
  row({
    会計日: o.d ?? "20260801",
    会計ID: o.id,
    会計区分: o.kubun ?? "会計",
    "メニュー・店販・割引・サービス・オプション": o.menu ?? "",
    個数: o.qty ?? "1",
    金額: o.amt ?? "0",
    スタッフ: o.staff,
    指名: o.nom ?? "指名なし",
    新規再来: o.nw ?? "再来",
  });

test("回数券メニューの判定（指名チケットの前売りは除く）", () => {
  assert.equal(isKaisukenMenu("男性90分5回券"), true);
  assert.equal(isKaisukenMenu("女性60分3回券"), true);
  assert.equal(isKaisukenMenu("指名5回券"), false); // 指名チケットはバック対象外
  assert.equal(isKaisukenMenu("男性90分チケット1枚"), false); // 消化であって販売ではない
  assert.equal(isKaisukenMenu(""), false);
  assert.equal(isNominationTicketMenu("指名10回券"), true);
  assert.equal(isNominationTicketMenu("指名チケット"), false);
});

test("1会計が複数行でも1来店として数える", () => {
  const csv = [
    HEAD,
    r({ id: "A1", staff: "AINA", menu: "男性90分チケット1枚", nom: "指名あり" }),
    r({ id: "A1", staff: "AINA", menu: "指名チケット", nom: "指名あり" }),
  ].join("\n");
  const t = tallySalonBoardCsv(csv, "2026-08").tallies[0];
  assert.equal(t.visits, 1);
  assert.equal(t.nominations, 1);
});

test("取り消しは個数-1で相殺され、回数券は正味になる", () => {
  const csv = [
    HEAD,
    r({ d: "20260830", id: "S1", staff: "DAYAN", menu: "男性90分5回券", qty: "1", amt: "66000", nw: "新規" }),
    r({ d: "20260831", id: "S2", kubun: "取り消し会計", staff: "DAYAN", menu: "男性90分5回券", qty: "-1", amt: "-66000", nw: "新規" }),
    r({ d: "20260805", id: "S3", staff: "DAYAN", menu: "男性60分3回券", qty: "1", amt: "29040", nw: "新規" }),
  ].join("\n");
  const t = tallySalonBoardCsv(csv, "2026-08").tallies[0];
  assert.equal(t.kaisuken, 1); // 3回券の1本だけ。取り消された5回券は残らない
  assert.equal(t.visits, 2); // 取り消し会計は来店に数えない（元の売上は残る）
});

test("指名は会計単位。同じ会計に複数行あっても1件", () => {
  const csv = [
    HEAD,
    r({ id: "N1", staff: "KAYO", nom: "指名あり" }),
    r({ id: "N1", staff: "KAYO", menu: "単発指名料", nom: "指名あり" }),
    r({ id: "N2", staff: "KAYO", nom: "指名なし" }),
  ].join("\n");
  const t = tallySalonBoardCsv(csv, "2026-08").tallies[0];
  assert.equal(t.visits, 2);
  assert.equal(t.nominations, 1);
});

test("指名回数券の前売りは回数券本数に入れず別枠で数える", () => {
  const csv = [
    HEAD,
    r({ id: "X1", staff: "AINA", menu: "指名5回券", qty: "1", amt: "16500" }),
    r({ id: "X1", staff: "AINA", menu: "男性90分5回券", qty: "1", amt: "66000" }),
  ].join("\n");
  const t = tallySalonBoardCsv(csv, "2026-08").tallies[0];
  assert.equal(t.kaisuken, 1);
  assert.equal(t.nominationTickets, 1);
});

test("対象月以外を除外し、CSVに含まれる月を返す", () => {
  const csv = [
    HEAD,
    r({ d: "20260731", id: "P1", staff: "AYU", menu: "男性60分3回券" }),
    r({ d: "20260801", id: "P2", staff: "AYU", menu: "男性60分3回券" }),
    r({ d: "20260901", id: "P3", staff: "AYU" }),
  ].join("\n");
  const res = tallySalonBoardCsv(csv, "2026-08");
  assert.equal(res.monthRows, 1);
  assert.equal(res.tallies[0].kaisuken, 1);
  assert.deepEqual(res.monthsInCsv, ["2026-07", "2026-08", "2026-09"]);
});

test("新規と再来を数える", () => {
  const csv = [
    HEAD,
    r({ id: "V1", staff: "MIYUKA", nw: "新規" }),
    r({ id: "V2", staff: "MIYUKA", nw: "再来" }),
    r({ id: "V3", staff: "MIYUKA", nw: "新規" }),
  ].join("\n");
  const t = tallySalonBoardCsv(csv, "2026-08").tallies[0];
  assert.equal(t.visits, 3);
  assert.equal(t.newVisits, 2);
});

test("必須列がなければエラー / 空CSVは0件", () => {
  assert.throws(() => tallySalonBoardCsv("会計日,スタッフ\n20260801,AINA", "2026-08"), /列が見つかりません/);
  assert.equal(tallySalonBoardCsv("", "2026-08").monthRows, 0);
});
