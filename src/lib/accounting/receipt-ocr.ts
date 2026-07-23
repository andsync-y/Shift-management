// =====================================================================
// 領収書OCR（Claude ビジョン）
// =====================================================================
// まとめ撮り画像（複数の領収書）を Claude に渡し、各領収書を
// {date, amount, merchant, account} として配列抽出する。
// account は勘定科目の AI 提案（ACCOUNTS の候補から選択）。
// アプリ既存の ANTHROPIC_API_KEY を使用（Gemini不要）。モデルは RECEIPT_OCR_MODEL で上書き可。
// =====================================================================

import Anthropic from "@anthropic-ai/sdk";
import { ACCOUNTS } from "./accounts";

export interface DetectedReceipt {
  date: string | null; // "YYYY-MM-DD"
  amount: number | null; // 税込合計
  merchant: string | null;
  account: string | null; // AI提案の勘定科目（ACCOUNTS のいずれか）
  payment: "card" | "cash" | null; // 支払手段（レシートの印字から判定・不明はnull）
}

export interface ReceiptOcrResult {
  ok: boolean;
  receipts: DetectedReceipt[];
  message?: string;
}

type SupportedMedia = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

const PROMPT = `あなたは日本の経理担当者です。これは「複数の領収書・レシートを並べて1枚に撮影した画像」です。
画像内のレシート/領収書を1枚ずつ検出し、それぞれについて読み取ってください。
事業の業態: ストレッチ・整体系のサロン店舗（施術サービス業）。

各レシートの抽出項目:
- date: 日付。"YYYY-MM-DD"。和暦・スラッシュ等は西暦ハイフンに正規化。年が無ければ当年。読めなければ null。
- amount: 支払合計金額（税込）。数値のみ（円記号・カンマ・「円」を除く）。小計や預り金ではなく「合計」。読めなければ null。
- merchant: 支払先（店名・会社名）。読めなければ null。
- payment: 支払手段。レシートの印字から判定する。
  クレジット・カード・VISA・Mastercard・AMEX・JCB・IC・タッチ決済 等の記載 → "card"
  現金・お預り・お釣り・釣銭 等の記載 → "cash"
  判別できなければ null。電子マネー・QR決済（PayPay等）は "card" とする。
- account: 勘定科目。店名と購入品目から最も適切なものを次の候補から1つだけ選ぶ:
  ${ACCOUNTS.join(" / ")}
  分類の目安: 施術用オイル・タオル・備品・日用品→消耗品費 / 取引先との飲食→接待交際費 /
  打合せの飲食（1人あたり少額）→会議費 / 携帯・ネット・切手→通信費 / 電車・バス・タクシー・ガソリン・駐車場→旅費交通費 /
  チラシ・ネット広告→広告宣伝費 / 電気・ガス・水道→水道光熱費 / 家賃→地代家賃 / 販売商品の仕入→仕入高 /
  業務委託→外注費 / スタッフの慰労・健康関連→福利厚生費 / セミナー・講習→研修費 / 書籍・雑誌→新聞図書費 /
  振込・決済手数料→支払手数料 / どれにも当てはまらない→雑費。判断がつかなければ null。

厳守ルール:
- レシート/領収書でないもの（メモ・商品・背景）は出力に含めない。
- 推測で値を捏造しない。読めない項目は必ず null（account は候補外の文字列を出さない）。
- 出力はJSONのみ（前後に説明文・コードフェンス・余計なキーを付けない）。
- 形式: {"receipts":[{"date":"YYYY-MM-DD","amount":1234,"merchant":"...","account":"消耗品費","payment":"card"}]}
- 1枚も検出できなければ {"receipts":[]}。`;

export async function extractReceipts(
  imageBase64: string,
  mediaType: SupportedMedia
): Promise<ReceiptOcrResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, receipts: [], message: "ANTHROPIC_API_KEY が未設定です。" };
  }
  const client = new Anthropic({ apiKey });
  const model = process.env.RECEIPT_OCR_MODEL || "claude-opus-4-8";

  try {
    const message = await client.messages.create({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as { receipts?: unknown }) : null;
    const raw = Array.isArray(parsed?.receipts) ? parsed!.receipts : [];

    const accountSet = new Set<string>(ACCOUNTS);
    const receipts: DetectedReceipt[] = raw.map((e) => {
      const r = e as Record<string, unknown>;
      return {
        date: typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
        amount: typeof r.amount === "number" && isFinite(r.amount) ? r.amount : null,
        merchant: typeof r.merchant === "string" && r.merchant.trim() ? r.merchant.trim() : null,
        // 候補リスト外の科目は捨てる（datalist・集計の並びと揃える）
        account: typeof r.account === "string" && accountSet.has(r.account.trim()) ? r.account.trim() : null,
        payment: r.payment === "card" || r.payment === "cash" ? r.payment : null,
      };
    });
    return { ok: true, receipts };
  } catch (e) {
    return { ok: false, receipts: [], message: e instanceof Error ? e.message : String(e) };
  }
}
