// =====================================================================
// 全銀フォーマット（振込データ）のテスト
// =====================================================================
// 銀行のアップロード画面はエラーを1つずつしか返さないため、桁ズレの調査に
// 何往復もかかる。実際に以下でつまずいた:
//   - ヘッダーに依頼人口座（96〜103桁目）が無く「口座番号エラー」
//   - 種別コードがメニューと不一致で「種別コードが不正」
//   - 銀行コードの既定値(三井住友)が残り、銀行を変えても古い名前が混入
// 桁位置と必須項目をここで固定する。
// =====================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildZenginData, toHankakuKana, type ZenginTransfer } from "@/lib/zengin";

const consignor = {
  consignorCode: "0622841413",
  consignorName: "ｶ) ｱﾝﾄﾞｼﾝｸ",
  bankCode: "2470",
  bankName: "",
  branchCode: "006",
  branchName: "",
  accountType: "1",
  accountNumber: "2841413",
};

const transfers: ZenginTransfer[] = [
  {
    bankCode: "0152", bankName: "", branchCode: "120", branchName: "",
    accountType: "1", accountNumber: "0235133", recipientName: "ﾌﾀﾏﾀ ｷﾖﾐ", amount: 69389,
  },
  {
    bankCode: "9900", bankName: "", branchCode: "248", branchName: "",
    accountType: "1", accountNumber: "3591869", recipientName: "ｻﾄｳ ﾀﾞﾔﾅﾗ", amount: 183644,
  },
];

function linesOf(typeCode: "21" | "11" = "21") {
  return buildZenginData(consignor, transfers, "2026-08-14", typeCode).text.split("\r\n").filter(Boolean);
}

describe("レコードの構造", () => {
  test("全行が120バイト・CRLF区切り", () => {
    const { text } = buildZenginData(consignor, transfers, "2026-08-14");
    assert.ok(text.endsWith("\r\n"), "最終行も改行で終わる");
    for (const [i, l] of text.split("\r\n").filter(Boolean).entries()) {
      assert.equal(l.length, 120, `${i + 1}行目が120桁でない`);
    }
  });

  test("ヘッダー1・データn・トレーラー1・エンド1", () => {
    const l = linesOf();
    assert.equal(l.length, 3 + transfers.length); // ヘッダー+明細n+トレーラー+エンド
    assert.equal(l[0][0], "1");
    assert.equal(l[1][0], "2");
    assert.equal(l[l.length - 2][0], "8");
    assert.equal(l[l.length - 1][0], "9");
  });
});

describe("ヘッダーの桁位置（1始まり）", () => {
  const h = linesOf()[0];
  const at = (from: number, len: number) => h.slice(from - 1, from - 1 + len);

  test("2〜3桁目=種別コード（21=総合振込 / 11=給与振込）", () => {
    assert.equal(at(2, 2), "21");
    assert.equal(linesOf("11")[0].slice(1, 3), "11", "給与振込は11");
  });
  test("5〜14桁目=委託者コード（ゼロ埋め10桁）", () => {
    assert.equal(at(5, 10), "0622841413");
  });
  test("15〜54桁目=委託者名（左詰め40桁）", () => {
    assert.equal(at(15, 40), "ｶ) ｱﾝﾄﾞｼﾝｸ".padEnd(40, " "));
  });
  test("55〜58桁目=取組日 MMDD", () => {
    assert.equal(at(55, 4), "0814");
  });
  test("59〜62桁目=仕向銀行番号", () => {
    assert.equal(at(59, 4), "2470");
  });
  test("78〜80桁目=仕向支店番号", () => {
    assert.equal(at(78, 3), "006");
  });
  test("96桁目=預金種目・97〜103桁目=依頼人口座番号", () => {
    // ここが空だと「口座番号エラー(E184-S1266)」で弾かれる
    assert.equal(at(96, 1), "1");
    assert.equal(at(97, 7), "2841413");
  });
  test("銀行名・支店名が未設定でも桁が崩れない（空欄で埋まる）", () => {
    assert.equal(at(63, 15), " ".repeat(15));
    assert.equal(at(81, 15), " ".repeat(15));
  });
});

// 受取人の銀行名・支店名。三井住友はコードから補完するが、しょうしんの総合振込は
// 空だとエラー（BZBE311164 / BZBE311170）。全角で入れても半角カナで出ること。
describe("受取人の銀行名・支店名", () => {
  test("6〜20桁目=金融機関名 / 24〜38桁目=支店名（左詰め15桁）", () => {
    const named: ZenginTransfer[] = [
      { ...transfers[0], bankName: "ジュウロク", branchName: "ナガラシテン" },
    ];
    const d = buildZenginData(consignor, named, "2026-08-14").text.split("\r\n")[1];
    assert.equal(d.slice(5, 20), "ｼﾞｭｳﾛｸ".padEnd(15, " "));
    assert.equal(d.slice(23, 38), "ﾅｶﾞﾗｼﾃﾝ".padEnd(15, " "));
    assert.equal(d.length, 120, "名称を入れても120桁のまま");
  });
});

describe("データレコードの桁位置（1始まり）", () => {
  const d = linesOf()[1];
  const at = (from: number, len: number) => d.slice(from - 1, from - 1 + len);

  test("2〜5桁目=銀行 / 21〜23桁目=支店", () => {
    assert.equal(at(2, 4), "0152");
    assert.equal(at(21, 3), "120");
  });
  test("43桁目=預金種目 / 44〜50桁目=口座番号（ゼロ埋め）", () => {
    assert.equal(at(43, 1), "1");
    assert.equal(at(44, 7), "0235133");
  });
  test("51〜80桁目=受取人名（左詰め30桁）", () => {
    assert.equal(at(51, 30), "ﾌﾀﾏﾀ ｷﾖﾐ".padEnd(30, " "));
  });
  test("81〜90桁目=振込金額（ゼロ埋め10桁）", () => {
    assert.equal(at(81, 10), "0000069389");
  });
  test("92桁目以降=新規コード0・振込区分7（電信）", () => {
    assert.equal(at(91, 1), "0");
    assert.equal(at(112, 1), "7");
  });
});

describe("トレーラー", () => {
  test("件数6桁・合計金額12桁が明細と一致する", () => {
    const l = linesOf();
    const t = l[l.length - 2];
    assert.equal(t.slice(1, 7), "000002");
    assert.equal(t.slice(7, 19), "000000253033"); // 69,389 + 183,644
    const sum = transfers.reduce((s, x) => s + x.amount, 0);
    assert.equal(Number(t.slice(7, 19)), sum);
  });
});

describe("文字変換", () => {
  test("全角カナ・英数を半角に、小文字を大文字に", () => {
    assert.equal(toHankakuKana("カブシキガイシャ"), "ｶﾌﾞｼｷｶﾞｲｼｬ");
    assert.equal(toHankakuKana("ａｂｃ１２３"), "ABC123");
  });
  test("使えない文字は半角スペースに置き換える", () => {
    assert.equal(toHankakuKana("山田 太郎"), " ".repeat(5)); // 漢字は不可（5文字→5スペース）
    assert.equal(toHankakuKana("ｶ) ｱﾝﾄﾞｼﾝｸ"), "ｶ) ｱﾝﾄﾞｼﾝｸ"); // 括弧は可
  });
  test("null・undefined は空文字", () => {
    assert.equal(toHankakuKana(null), "");
    assert.equal(toHankakuKana(undefined), "");
  });
});
