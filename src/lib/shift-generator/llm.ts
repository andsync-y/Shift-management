// =====================================================================
// Claude API によるシフト案のレビュー / 調整提案（LLM 補助）
// =====================================================================
// ソルバーが出した割当を入力に、人手不足や偏りに対する
// 自然言語の改善提案・補足コメントを生成する。
// ANTHROPIC_API_KEY 未設定時はスキップ（ソルバー結果のみ返す）。
// =====================================================================

import Anthropic from "@anthropic-ai/sdk";
import type { Profile } from "@/lib/types";
import type { GenerateResult } from "./types";

export interface LlmReview {
  available: boolean;
  summary: string;
  suggestions: string[];
}

export async function reviewShiftPlan(
  result: GenerateResult,
  staff: Profile[],
  year: number,
  month: number
): Promise<LlmReview> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      available: false,
      summary: "LLM 補助は未設定です（ANTHROPIC_API_KEY 未設定）。ソルバー結果をそのまま利用します。",
      suggestions: [],
    };
  }

  const client = new Anthropic({ apiKey });
  const staffMap = new Map(staff.map((s) => [s.id, s]));

  const hoursLines = Object.entries(result.staffHours)
    .map(([id, h]) => {
      const s = staffMap.get(id);
      if (!s) return null;
      return `- ${s.full_name}（${s.employment_type === "full_time" ? "正社員" : "アルバイト"}, 希望${s.min_hours_per_week}〜${s.max_hours_per_week}h/週）: 割当 ${h.toFixed(1)}h`;
    })
    .filter(Boolean)
    .join("\n");

  const shortageLines = result.shortages
    .slice(0, 30)
    .map(
      (s) => `- ${s.work_date} ${s.start_time}〜${s.end_time}: 必要 ${s.required} / 充足 ${s.filled}`
    )
    .join("\n");

  const prompt = `あなたは「全力ストレッチ岐阜長良店」のシフト管理を担当する店長アシスタントです。
以下は ${year}年${month}月 のシフト自動生成結果です。実務目線で講評し、改善提案を簡潔に出してください。

# スタッフ別の割当時間
${hoursLines || "（データなし）"}

# 人手不足の時間帯
${shortageLines || "なし"}

以下の JSON 形式のみで回答してください（前後に説明文を付けない）:
{
  "summary": "全体講評を2〜3文で",
  "suggestions": ["改善提案1", "改善提案2", ...]
}`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    return {
      available: true,
      summary: parsed?.summary ?? text.slice(0, 500),
      suggestions: Array.isArray(parsed?.suggestions) ? parsed.suggestions : [],
    };
  } catch (e) {
    return {
      available: false,
      summary: `LLM 補助の呼び出しに失敗しました: ${e instanceof Error ? e.message : String(e)}`,
      suggestions: [],
    };
  }
}
