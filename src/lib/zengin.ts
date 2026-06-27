// 全銀協規定形式（総合振込）データの生成。SMBC（Web21/ValueDoor）等にアップロードして
// まとめて振込を実行するための固定長120バイト/レコード・Shift_JIS ファイルを作る。
// レコード: ヘッダー(1) / データ(2)×件数 / トレーラー(8) / エンド(9)。
import Encoding from "encoding-japanese";

export interface ZenginConsignor {
  consignorCode: string; // 委託者コード(10)
  consignorName: string; // 委託者名（カナ・40）
  bankCode: string; // 仕向銀行番号(4)
  bankName: string; // 仕向銀行名（カナ・15）
  branchCode: string; // 仕向支店番号(3)
  branchName: string; // 仕向支店名（カナ・15）
}

export interface ZenginTransfer {
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountType: string; // 預金種目 1=普通 2=当座
  accountNumber: string;
  recipientName: string; // 受取人名（カナ）
  amount: number;
}

// 全角→半角（カナ・英数）＋大文字化＋全銀で使えない文字をスペースに。
export function toHankakuKana(s: string | null | undefined): string {
  if (!s) return "";
  let r = Encoding.toHankakuCase(Encoding.toHankanaCase(String(s)));
  r = r.toUpperCase();
  // 許可: A-Z 0-9 半角space 半角カナ(｡-ﾟ) と一部記号。それ以外は半角スペースに。
  r = r.replace(/[^A-Z0-9 ｡-ﾟ().\-/]/g, " ");
  return r;
}

function padLeft(s: string, len: number): string {
  const t = (s ?? "").slice(0, len);
  return t + " ".repeat(Math.max(0, len - t.length)); // 左詰め・スペース埋め
}
function digits(v: string | number, len: number): string {
  const t = String(v).replace(/[^0-9]/g, "").slice(-len);
  return "0".repeat(Math.max(0, len - t.length)) + t; // 右詰め・ゼロ埋め
}

// MMDD（取組日＝振込指定日）
function mmdd(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (m) return m[2] + m[3];
  return digits(date, 4);
}

export function buildZenginData(
  consignor: ZenginConsignor,
  transfers: ZenginTransfer[],
  transferDate: string // "YYYY-MM-DD"
): { text: string; bytes: Buffer; count: number; total: number } {
  const header =
    "1" + // データ区分
    "21" + // 種別コード（総合振込）
    "0" + // コード区分（0=JIS）
    digits(consignor.consignorCode, 10) +
    padLeft(toHankakuKana(consignor.consignorName), 40) +
    mmdd(transferDate) +
    digits(consignor.bankCode, 4) +
    padLeft(toHankakuKana(consignor.bankName), 15) +
    digits(consignor.branchCode, 3) +
    padLeft(toHankakuKana(consignor.branchName), 15) +
    " ".repeat(25); // ダミー

  const dataRecords = transfers.map(
    (t) =>
      "2" + // データ区分
      digits(t.bankCode, 4) +
      padLeft(toHankakuKana(t.bankName), 15) +
      digits(t.branchCode, 3) +
      padLeft(toHankakuKana(t.branchName), 15) +
      "    " + // 手形交換所番号(4)
      (t.accountType === "2" ? "2" : "1") + // 預金種目
      digits(t.accountNumber, 7) +
      padLeft(toHankakuKana(t.recipientName), 30) +
      digits(Math.max(0, Math.round(t.amount)), 10) + // 振込金額
      "0" + // 新規コード
      " ".repeat(10) + // 顧客コード1
      " ".repeat(10) + // 顧客コード2
      "7" + // 振込区分（7=電信）
      " " + // 識別表示
      " ".repeat(7) // ダミー
  );

  const total = transfers.reduce((s, t) => s + Math.max(0, Math.round(t.amount)), 0);
  const trailer = "8" + digits(transfers.length, 6) + digits(total, 12) + " ".repeat(101);
  const end = "9" + " ".repeat(119);

  const lines = [header, ...dataRecords, trailer, end];
  const text = lines.join("\r\n") + "\r\n";

  // Shift_JIS へ変換（半角カナは1バイト＝固定長を維持）
  const sjis = Encoding.convert(Encoding.stringToCode(text), { to: "SJIS", from: "UNICODE" });
  const bytes = Buffer.from(sjis as number[]);

  return { text, bytes, count: transfers.length, total };
}
