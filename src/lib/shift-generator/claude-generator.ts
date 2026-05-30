// =====================================================================
// Claude API による店舗ルール参照シフト生成
// =====================================================================
// 店舗ルール(getStoreRules) + スタッフ条件/希望休 をプロンプト化し、
// Claude に「指定JSON形式のみ」でシフトを返させる（shift-prompt のテンプレート準拠）。
// 返ってきた schedule[].entries[] を厳密に検証し、不正・off は除外して
// アプリの割当(GeneratedAssignment)へ変換する。
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

// Claude が返す JSON の想定型（必要な部分のみ）
interface ScheduleEntry {
  date?: string;
  shift_type?: string;
  start_time?: string;
  end_time?: string;
}
interface ScheduleStaff {
  staff_id?: string;
  staff_name?: string;
  entries?: ScheduleEntry[];
}
interface ScheduleJson {
  schedule?: ScheduleStaff[];
  warnings?: string[];
  insurance_summary?: {
    enrolled?: string[];
    optional?: string[];
    estimated_monthly_cost?: number;
  };
}

const TIME_RE = /^\d{2}:\d{2}$/;

function durationHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

// テキストから JSON オブジェクトを抽出する（コードフェンスや前後文を許容）。
function extractJson(text: string): ScheduleJson | null {
  let t = text.trim();
  // ```json ... ``` のフェンスを除去
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1)) as ScheduleJson;
  } catch {
    return null;
  }
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
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content: userContent }],
    });
  } catch (e) {
    return empty(`Claude API 呼び出しに失敗: ${e instanceof Error ? e.message : String(e)}`);
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = extractJson(text);
  if (!parsed || !Array.isArray(parsed.schedule)) {
    return empty(
      message.stop_reason === "max_tokens"
        ? "出力が長すぎて途中で切れました。対象期間を短くするか、再試行してください。"
        : "Claude の出力をJSONとして解釈できませんでした。再試行してください。"
    );
  }

  // --- 検証 ---
  const validIds = new Set(input.staff.filter((s) => s.is_active).map((s) => s.id));
  const lastDay = new Date(input.year, input.month, 0).getDate();
  const monthPrefix = `${input.year}-${String(input.month).padStart(2, "0")}-`;

  const assignments: GeneratedAssignment[] = [];
  const staffHours: Record<string, number> = {};
  let rejected = 0;

  for (const member of parsed.schedule) {
    const staff_id = String(member.staff_id ?? "");
    for (const entry of member.entries ?? []) {
      const shiftType = String(entry.shift_type ?? "");
      if (shiftType === "off") continue; // 休みは保存しない

      const work_date = String(entry.date ?? "");
      const start_time = String(entry.start_time ?? "");
      const end_time = String(entry.end_time ?? "");
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

      assignments.push({
        staff_id,
        work_date,
        start_time,
        end_time,
        note: shiftType || null,
      });
      staffHours[staff_id] = (staffHours[staff_id] ?? 0) + durationHours(start_time, end_time);
    }
  }

  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.slice() : [];
  if (rejected > 0) {
    warnings.push(`${rejected} 件の割当が検証で除外されました（不正なID・日付・時刻）。`);
  }

  // 社保サマリーを要約に整形
  const ins = parsed.insurance_summary;
  let summary = "";
  if (ins) {
    const parts: string[] = [];
    if (ins.enrolled?.length) parts.push(`社保加入: ${ins.enrolled.join("、")}`);
    if (ins.optional?.length) parts.push(`任意: ${ins.optional.join("、")}`);
    if (typeof ins.estimated_monthly_cost === "number") {
      parts.push(`事業主負担概算: 約${ins.estimated_monthly_cost.toLocaleString()}円/月`);
    }
    summary = parts.join(" ／ ");
  }

  return {
    ok: assignments.length > 0,
    assignments,
    staffHours,
    summary,
    warnings,
    model,
    rejected,
  };
}
