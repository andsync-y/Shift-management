// =====================================================================
// 領収書OCR（Claude ビジョン）
// =====================================================================
// まとめ撮り画像（複数の領収書）を Claude に渡し、各領収書を
// {date, amount, merchant} として配列抽出する。
// アプリ既存の ANTHROPIC_API_KEY を使用（Gemini不要）。モデルは RECEIPT_OCR_MODEL で上書き可。
// =====================================================================

import Anthropic from "@anthropic-ai/sdk";

export interface DetectedReceipt {
  date: string | null; // "YYYY-MM-DD"
  amount: number | null; // 税込合計
  merchant: string | null;
}

export interface ReceiptOcrResult {
  ok: boolean;
  receipts: DetectedReceipt[];
  message?: string;
}

type SupportedMedia = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

const PROMPT = `あなたは日本の経理担当者です。これは「複数の領収書・レシートを並べて1枚に撮影した画像」です。
画像内のレシート/領収書を1枚ずつ検出し、それぞれについて読み取ってください。

各レシートの抽出項目:
- date: 日付。"YYYY-MM-DD"。和暦・スラッシュ等は西暦ハイフンに正規化。年が無ければ当年。読めなければ null。
- amount: 支払合計金額（税込）。数値のみ（円記号・カンマ・「円」を除く）。小計や預り金ではなく「合計」。読めなければ null。
- merchant: 支払先（店名・会社名）。読めなければ null。

厳守ルール:
- レシート/領収書でないもの（メモ・商品・背景）は出力に含めない。
- 推測で値を捏造しない。読めない項目は必ず null。
- 出力はJSONのみ（前後に説明文・コードフェンス・余計なキーを付けない）。
- 形式: {"receipts":[{"date":"YYYY-MM-DD","amount":1234,"merchant":"..."}]}
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

    const receipts: DetectedReceipt[] = raw.map((e) => {
      const r = e as Record<string, unknown>;
      return {
        date: typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
        amount: typeof r.amount === "number" && isFinite(r.amount) ? r.amount : null,
        merchant: typeof r.merchant === "string" && r.merchant.trim() ? r.merchant.trim() : null,
      };
    });
    return { ok: true, receipts };
  } catch (e) {
    return { ok: false, receipts: [], message: e instanceof Error ? e.message : String(e) };
  }
}
