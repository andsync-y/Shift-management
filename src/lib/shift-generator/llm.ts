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
import { weeklyAverageFromMonthly } from "@/lib/work-hours";

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

  // 月合計と週平均を必ず両方渡す。以前は月合計だけを渡して「希望◯h/週」と
  // 並べていたため、レビュー側が単位を取り違えて「上限を大きく超過」と
  // 誤判定していた（例: 月157.5h＝週36.3h を 週上限40h と比較して超過扱い）。
  const hoursLines = Object.entries(result.staffHours)
    .map(([id, h]) => {
      const s = staffMap.get(id);
      if (!s) return null;
      const weekly = weeklyAverageFromMonthly(h);
      const kind = s.employment_type === "full_time" ? "正社員" : "アルバイト";
      const shaho = s.shaho_enrolled ? "社保加入" : "社保なし";
      return `- ${s.full_name}（${kind}・${shaho}, 週の希望 ${s.min_hours_per_week}〜${s.max_hours_per_week}h）: 月合計 ${h.toFixed(1)}h ＝ 週平均 ${weekly.toFixed(1)}h`;
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

# 数字の読み方（重要）
- 時間はすべて【実働】（休憩の自動控除後）です。
- 「週の希望 ◯〜◯h」は**週あたり**の下限・上限です。**月合計とは比較しないでください**。
  上限・下限を超えているかは必ず「週平均」の値と比べてください。
- 社会保険は週30時間がライン。加入者は週30h以上を確保、社保なしの人は週30h未満に抑えるのが正です。
  ただし**短時間正社員は、通常の正社員の4分の3以上**であれば週30h未満でも加入要件を満たします。

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
