"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateShifts } from "@/lib/shift-generator/solver";
import { reviewShiftPlan } from "@/lib/shift-generator/llm";
import { generateShiftsWithClaude } from "@/lib/shift-generator/claude-generator";
import type {
  AvailabilityPreference,
  Profile,
  ShiftRequirement,
  TimeOffRequest,
} from "@/lib/types";
import type { LlmReview } from "@/lib/shift-generator/llm";
import type { GenerateResult } from "@/lib/shift-generator/types";
import type { ClaudeGenerateResult } from "@/lib/shift-generator/claude-generator";

// --- シフト期間の作成 -------------------------------------------------
export async function createPeriod(_prev: unknown, formData: FormData) {
  await requireAdmin();
  const schema = z.object({
    year: z.coerce.number().int().min(2024).max(2100),
    month: z.coerce.number().int().min(1).max(12),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "年月を確認してください。" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("shift_periods")
    .insert({ year: parsed.data.year, month: parsed.data.month });

  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "その年月の期間は既に存在します。" : error.message,
    };
  }
  revalidatePath("/admin/shifts");
  return { ok: true, message: "シフト期間を作成しました。" };
}

// --- 必要人数の追加 ---------------------------------------------------
export async function addRequirement(periodId: string, formData: FormData) {
  await requireAdmin();
  const schema = z.object({
    day_of_week: z.coerce.number().int().min(0).max(6),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    required_staff: z.coerce.number().int().min(0).max(50),
  });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "入力を確認してください。" };

  const supabase = await createClient();
  await supabase
    .from("shift_requirements")
    .insert({ period_id: periodId, ...parsed.data });
  revalidatePath(`/admin/shifts/${periodId}`);
  return { ok: true, message: "必要人数を追加しました。" };
}

export async function deleteRequirement(id: string, periodId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("shift_requirements").delete().eq("id", id);
  revalidatePath(`/admin/shifts/${periodId}`);
}

// --- AIシフト生成 -----------------------------------------------------
export interface GenerateActionResult {
  ok: boolean;
  message: string;
  result?: GenerateResult;
  review?: LlmReview;
}

export async function generatePeriodShifts(
  periodId: string
): Promise<GenerateActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: period } = await supabase
    .from("shift_periods")
    .select("*")
    .eq("id", periodId)
    .single();
  if (!period) return { ok: false, message: "期間が見つかりません。" };

  const [{ data: staff }, { data: availability }, { data: requirements }, { data: timeOff }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("is_active", true),
      supabase.from("availability_preferences").select("*"),
      supabase.from("shift_requirements").select("*").eq("period_id", periodId),
      supabase
        .from("time_off_requests")
        .select("*")
        .eq("status", "approved")
        .eq("period_id", periodId),
    ]);

  const result = generateShifts({
    year: period.year,
    month: period.month,
    staff: (staff ?? []) as Profile[],
    availability: (availability ?? []) as AvailabilityPreference[],
    requirements: (requirements ?? []) as ShiftRequirement[],
    timeOff: (timeOff ?? []) as TimeOffRequest[],
  });

  // 既存のドラフトシフトを削除して入れ替え
  await supabase.from("shifts").delete().eq("period_id", periodId);

  if (result.assignments.length > 0) {
    const rows = result.assignments.map((a) => ({
      period_id: periodId,
      staff_id: a.staff_id,
      work_date: a.work_date,
      start_time: a.start_time,
      end_time: a.end_time,
      note: a.note,
      ai_generated: true,
    }));
    const { error } = await supabase.from("shifts").insert(rows);
    if (error) return { ok: false, message: `保存に失敗: ${error.message}` };
  }

  // LLM 補助によるレビュー（API キーがあれば）
  const review = await reviewShiftPlan(
    result,
    (staff ?? []) as Profile[],
    period.year,
    period.month
  );

  revalidatePath(`/admin/shifts/${periodId}`);
  return {
    ok: true,
    message: `${result.assignments.length} 件のシフトを生成しました。`,
    result,
    review,
  };
}

// --- Claude API による店舗ルール参照シフト生成 -----------------------
export interface ClaudeGenerateActionResult {
  ok: boolean;
  message: string;
  result?: ClaudeGenerateResult;
}

export async function generatePeriodShiftsWithClaude(
  periodId: string
): Promise<ClaudeGenerateActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: period } = await supabase
    .from("shift_periods")
    .select("*")
    .eq("id", periodId)
    .single();
  if (!period) return { ok: false, message: "期間が見つかりません。" };

  const [{ data: staff }, { data: availability }, { data: timeOff }] = await Promise.all([
    supabase.from("profiles").select("*").eq("is_active", true),
    supabase.from("availability_preferences").select("*"),
    supabase
      .from("time_off_requests")
      .select("*")
      .eq("status", "approved")
      .eq("period_id", periodId),
  ]);

  const result = await generateShiftsWithClaude({
    year: period.year,
    month: period.month,
    staff: (staff ?? []) as Profile[],
    availability: (availability ?? []) as AvailabilityPreference[],
    timeOff: (timeOff ?? []) as TimeOffRequest[],
  });

  if (!result.ok) {
    return { ok: false, message: result.summary || "生成に失敗しました。", result };
  }

  // 既存シフトを置き換えて保存
  await supabase.from("shifts").delete().eq("period_id", periodId);
  const rows = result.assignments.map((a) => ({
    period_id: periodId,
    staff_id: a.staff_id,
    work_date: a.work_date,
    start_time: a.start_time,
    end_time: a.end_time,
    note: a.note,
    ai_generated: true,
  }));
  const { error } = await supabase.from("shifts").insert(rows);
  if (error) return { ok: false, message: `保存に失敗: ${error.message}`, result };

  revalidatePath(`/admin/shifts/${periodId}`);
  return {
    ok: true,
    message: `Claude(${result.model})が ${result.assignments.length} 件のシフトを生成しました。`,
    result,
  };
}

// --- 固定シフトの月次一括展開 ---------------------------------------
export interface ExpandFixedActionResult {
  ok: boolean;
  message: string;
  created?: number;
  skippedOff?: number;
}

export async function expandFixedShifts(
  periodId: string
): Promise<ExpandFixedActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: period } = await supabase
    .from("shift_periods")
    .select("*")
    .eq("id", periodId)
    .single();
  if (!period) return { ok: false, message: "期間が見つかりません。" };

  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(period.year, period.month, 0).getDate();
  const monthStart = `${period.year}-${pad(period.month)}-01`;
  const monthEnd = `${period.year}-${pad(period.month)}-${pad(lastDay)}`;

  const [{ data: staff }, { data: fixed }, { data: timeOff }] = await Promise.all([
    supabase.from("profiles").select("id,is_active").eq("is_active", true),
    supabase.from("fixed_shifts").select("*"),
    supabase
      .from("time_off_requests")
      .select("*")
      .eq("status", "approved")
      .gte("off_date", monthStart)
      .lte("off_date", monthEnd),
  ]);

  const activeIds = new Set((staff ?? []).map((s) => s.id));
  const fixedList = (fixed ?? []).filter((f) => activeIds.has(f.staff_id));
  if (fixedList.length === 0) {
    return { ok: false, message: "固定シフトが未登録です。スタッフ詳細で登録してください。" };
  }

  // 承認済みお休みを (staff_id, date) で索引化
  const offIndex = new Map<string, { start: string | null; end: string | null }[]>();
  for (const o of timeOff ?? []) {
    const key = `${o.staff_id}|${o.off_date}`;
    if (!offIndex.has(key)) offIndex.set(key, []);
    offIndex.get(key)!.push({ start: o.start_time, end: o.end_time });
  }
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const overlaps = (s1: string, e1: string, s2: string, e2: string) =>
    toMin(s1) < toMin(e2) && toMin(s2) < toMin(e1);

  const rows: {
    period_id: string;
    staff_id: string;
    work_date: string;
    start_time: string;
    end_time: string;
    note: string | null;
    ai_generated: boolean;
  }[] = [];
  let skippedOff = 0;

  for (let d = 1; d <= lastDay; d++) {
    const date = `${period.year}-${pad(period.month)}-${pad(d)}`;
    const dow = new Date(period.year, period.month - 1, d).getDay();
    for (const f of fixedList) {
      if (f.day_of_week !== dow) continue;

      // 希望休チェック（終日 or 時間帯重複）
      const offs = offIndex.get(`${f.staff_id}|${date}`);
      let isOff = false;
      if (offs) {
        for (const o of offs) {
          if (o.start === null || o.end === null) {
            isOff = true;
            break;
          }
          if (overlaps(o.start, o.end, f.start_time, f.end_time)) {
            isOff = true;
            break;
          }
        }
      }
      if (isOff) {
        skippedOff++;
        continue;
      }

      rows.push({
        period_id: periodId,
        staff_id: f.staff_id,
        work_date: date,
        start_time: f.start_time,
        end_time: f.end_time,
        note: f.shift_type ? `固定(${f.shift_type})` : "固定シフト",
        ai_generated: false,
      });
    }
  }

  // 既存シフトを置き換え
  await supabase.from("shifts").delete().eq("period_id", periodId);
  if (rows.length > 0) {
    const { error } = await supabase.from("shifts").insert(rows);
    if (error) return { ok: false, message: `保存に失敗: ${error.message}` };
  }

  revalidatePath(`/admin/shifts/${periodId}`);
  return {
    ok: true,
    message: `固定シフトを展開しました（${rows.length}件作成 / 希望休で${skippedOff}件除外）。`,
    created: rows.length,
    skippedOff,
  };
}

// --- 公開 / 確定 ------------------------------------------------------
export async function setPeriodStatus(
  periodId: string,
  status: "draft" | "published" | "confirmed"
) {
  await requireAdmin();
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "published") patch.published_at = new Date().toISOString();
  if (status === "confirmed") patch.confirmed_at = new Date().toISOString();
  await supabase.from("shift_periods").update(patch).eq("id", periodId);
  revalidatePath(`/admin/shifts/${periodId}`);
  revalidatePath("/admin/shifts");
}

// --- シフトの手動上書き（追加 / 時刻変更 / 削除） --------------------
const shiftSchema = z.object({
  staff_id: z.string().uuid("スタッフを選択してください"),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を確認してください"),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  note: z.string().optional(),
});

export async function addShift(periodId: string, formData: FormData) {
  await requireAdmin();
  const parsed = shiftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  if (parsed.data.start_time >= parsed.data.end_time) {
    return { ok: false, message: "終了時刻は開始時刻より後にしてください。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("shifts").insert({
    period_id: periodId,
    staff_id: parsed.data.staff_id,
    work_date: parsed.data.work_date,
    start_time: parsed.data.start_time,
    end_time: parsed.data.end_time,
    note: parsed.data.note || "手動追加",
    ai_generated: false,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/admin/shifts/${periodId}`);
  return { ok: true, message: "シフトを追加しました。" };
}

export async function updateShift(
  shiftId: string,
  periodId: string,
  startTime: string,
  endTime: string
) {
  await requireAdmin();
  if (startTime >= endTime) {
    return { ok: false, message: "終了時刻は開始時刻より後にしてください。" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("shifts")
    .update({ start_time: startTime, end_time: endTime, ai_generated: false })
    .eq("id", shiftId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/shifts/${periodId}`);
  return { ok: true, message: "更新しました。" };
}

export async function deleteShift(shiftId: string, periodId: string) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("shifts").delete().eq("id", shiftId);
  revalidatePath(`/admin/shifts/${periodId}`);
}
