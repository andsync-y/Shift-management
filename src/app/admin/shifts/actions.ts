"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateShifts } from "@/lib/shift-generator/solver";
import { reviewShiftPlan } from "@/lib/shift-generator/llm";
import type {
  AvailabilityPreference,
  Profile,
  ShiftRequirement,
  TimeOffRequest,
} from "@/lib/types";
import type { LlmReview } from "@/lib/shift-generator/llm";
import type { GenerateResult } from "@/lib/shift-generator/types";

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
