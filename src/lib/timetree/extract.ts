// =====================================================================
// タイムツリー(TimeTree)スクリーンショットの予定抽出（Claude 画像認識）
// =====================================================================
// 二俣・川島の新体操教室など、外部カレンダーの予定を画像から読み取り、
// 不可時間ブロック(staff_blackouts)の下書きに変換する。
// ANTHROPIC_API_KEY 未設定時は無効。モデルは TIMETREE_MODEL で上書き可。
// =====================================================================

import Anthropic from "@anthropic-ai/sdk";

export interface ExtractedEvent {
  date: string; // "YYYY-MM-DD"
  start: string; // "HH:MM"（不明なら ""）
  end: string;
  title: string;
}

export interface ExtractResult {
  ok: boolean;
  events: ExtractedEvent[];
  message?: string;
}

type SupportedMedia = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export async function extractTimetreeEvents(
  imageBase64: string,
  mediaType: SupportedMedia,
  opts: { year?: number } = {}
): Promise<ExtractResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, events: [], message: "画像解析は未設定です（ANTHROPIC_API_KEY 未設定）。" };
  }
  const client = new Anthropic({ apiKey });
  const model = process.env.TIMETREE_MODEL || "claude-opus-4-8";
  const yearHint = opts.year ?? new Date().getFullYear();

  const prompt = `これはTimeTree（タイムツリー）カレンダーのスクリーンショットです。表示されている予定をすべて読み取ってください。

抽出ルール:
- 各予定について date("YYYY-MM-DD") / start("HH:MM") / end("HH:MM") / title を返す。
- 画像に年が無ければ ${yearHint} 年として解釈する。月日は画像から読む。
- 開始・終了が明示されていない終日予定は start="00:00", end="23:59"。
- 時刻が一部しか読めない場合、読めない側は空文字 "" にする（推測しすぎない）。
- 祝日ラベルや月表示などの予定でないものは含めない。

出力は次のJSONのみ（前後に説明文やコードフェンスを付けない）:
{"events":[{"date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","title":"..."}]}`;

  try {
    const message = await client.messages.create({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as { events?: unknown }) : null;
    const raw = Array.isArray(parsed?.events) ? parsed!.events : [];

    const events: ExtractedEvent[] = raw
      .map((e) => {
        const ev = e as Record<string, unknown>;
        return {
          date: typeof ev.date === "string" ? ev.date : "",
          start: typeof ev.start === "string" ? ev.start.slice(0, 5) : "",
          end: typeof ev.end === "string" ? ev.end.slice(0, 5) : "",
          title: typeof ev.title === "string" ? ev.title : "",
        };
      })
      .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date));

    return { ok: true, events };
  } catch (e) {
    return { ok: false, events: [], message: e instanceof Error ? e.message : String(e) };
  }
}
