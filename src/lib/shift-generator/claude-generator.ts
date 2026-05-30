// =====================================================================
// Claude API による店舗ルール参照シフト生成
// =====================================================================
// 店舗ルール(getStoreRules) + スタッフ条件/希望休 をプロンプト化し、
// Claude に submit_shifts ツール（構造化出力）でシフト割当を返させる。
// 返ってきた割当は厳密に検証し、不正なものは除外する。
// =====================================================================

import Anthropic from "@anthropic-ai/sdk";
import { getStoreRules, getAnthropicModel } from "@/lib/store-rules";
import { buildSystemPrompt, buildUserContent } from "@/lib/shift-prompt";
import type {
  AvailabilityPreference,
  Profile,
  TimeOffRequest,
} from "@/lib/types";
import type { GeneratedAssignment } from "./types";

export interface ClaudeGenerateInput {
  year: number;
  month: number;
  staff: Profile[];
  availability: AvailabilityPreference[];
  timeOff: TimeOffRequest[];
}

export interface ClaudeGenerateResult {
  ok: boolean;
  assignments: GeneratedAssignment[];
  staffHours: Record<string, number>;
  summary: string;
  warnings: string[];
  model: string;
  rejected: number; // 検証で除外した件数
}

const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_shifts",
  description: "生成した月次シフトの割当一覧を提出する。",
  input_schema: {
    type: "object",
    properties: {
      shifts: {
        type: "array",
        description: "シフト割当の配列",
        items: {
          type: "object",
          properties: {
            staff_id: { type: "string", description: "スタッフのUUID（提供リストのidを正確に使う）" },
            work_date: { type: "string", description: "勤務日 YYYY-MM-DD" },
            start_time: { type: "string", description: "開始時刻 HH:MM(24h)" },
            end_time: { type: "string", description: "終了時刻 HH:MM(24h)" },
            shift_type_id: { type: "string", description: "シフト種別id (early/late/short_5h/short_6h)" },
            note: { type: "string", description: "備考(任意)" },
          },
          required: ["staff_id", "work_date", "start_time", "end_time"],
        },
      },
      summary: { type: "string", description: "生成方針の要約(2〜3文)" },
      warnings: {
        type: "array",
        items: { type: "string" },
        description: "人手不足や制約上の注意点",
      },
    },
    required: ["shifts"],
  },
};

const TIME_RE = /^\d{2}:\d{2}$/;

function durationHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

export async function generateShiftsWithClaude(
  input: ClaudeGenerateInput
): Promise<ClaudeGenerateResult> {
  const model = getAnthropicModel();
  const empty = (msg: string): ClaudeGenerateResult => ({
    ok: false,
    assignments: [],
    staffHours: {},
    summary: msg,
    warnings: [msg],
    model,
    rejected: 0,
  });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return empty("ANTHROPIC_API_KEY が未設定です。Vercel/.env.local に設定してください。");
  }

  const rules = getStoreRules();
  const system = buildSystemPrompt(rules);
  const userContent = buildUserContent(input);

  const client = new Anthropic({ apiKey });

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: 8000,
      system,
      tools: [SUBMIT_TOOL],
      tool_choice: { type: "tool", name: "submit_shifts" },
      messages: [{ role: "user", content: userContent }],
    });
  } catch (e) {
    return empty(`Claude API 呼び出しに失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "submit_shifts"
  );
  if (!toolUse) {
    return empty("Claude が構造化シフトを返しませんでした。再試行してください。");
  }

  const data = toolUse.input as {
    shifts?: Array<Record<string, unknown>>;
    summary?: string;
    warnings?: string[];
  };

  // --- 検証 ---
  const validIds = new Set(input.staff.filter((s) => s.is_active).map((s) => s.id));
  const lastDay = new Date(input.year, input.month, 0).getDate();
  const monthPrefix = `${input.year}-${String(input.month).padStart(2, "0")}-`;

  const assignments: GeneratedAssignment[] = [];
  const staffHours: Record<string, number> = {};
  let rejected = 0;

  for (const raw of data.shifts ?? []) {
    const staff_id = String(raw.staff_id ?? "");
    const work_date = String(raw.work_date ?? "");
    const start_time = String(raw.start_time ?? "");
    const end_time = String(raw.end_time ?? "");
    const note = raw.note ? String(raw.note) : null;

    const day = Number(work_date.slice(8, 10));
    const valid =
      validIds.has(staff_id) &&
      work_date.startsWith(monthPrefix) &&
      day >= 1 &&
      day <= lastDay &&
      TIME_RE.test(start_time) &&
      TIME_RE.test(end_time) &&
      start_time < end_time;

    if (!valid) {
      rejected++;
      continue;
    }

    assignments.push({ staff_id, work_date, start_time, end_time, note });
    staffHours[staff_id] = (staffHours[staff_id] ?? 0) + durationHours(start_time, end_time);
  }

  const warnings = Array.isArray(data.warnings) ? data.warnings.slice() : [];
  if (rejected > 0) {
    warnings.push(`${rejected} 件の割当が検証で除外されました（不正なIDや日付・時刻）。`);
  }

  return {
    ok: assignments.length > 0,
    assignments,
    staffHours,
    summary: data.summary ?? "",
    warnings,
    model,
    rejected,
  };
}
