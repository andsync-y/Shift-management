"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  day_of_week: z.coerce.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  shift_type: z.string().optional(),
});

// 固定シフトを1件追加（本人 or 管理者）
export async function addFixedShift(staffId: string, formData: FormData) {
  const me = await requireUser();
  if (me.role !== "super_admin" && me.id !== staffId) {
    return { ok: false, message: "権限がありません。" };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "入力内容を確認してください。" };
  if (parsed.data.start_time >= parsed.data.end_time) {
    return { ok: false, message: "終了時刻は開始時刻より後にしてください。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("fixed_shifts").insert({
    staff_id: staffId,
    day_of_week: parsed.data.day_of_week,
    start_time: parsed.data.start_time,
    end_time: parsed.data.end_time,
    shift_type: parsed.data.shift_type || null,
  });
  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "同じ曜日・開始時刻の固定シフトが既にあります。" : error.message,
    };
  }

  revalidatePath(`/admin/staff/${staffId}`);
  revalidatePath("/staff/fixed-shifts");
  return { ok: true, message: "固定シフトを追加しました。" };
}

export async function deleteFixedShift(id: string, staffId: string) {
  const me = await requireUser();
  if (me.role !== "super_admin" && me.id !== staffId) return;
  const supabase = await createClient();
  await supabase.from("fixed_shifts").delete().eq("id", id);
  revalidatePath(`/admin/staff/${staffId}`);
  revalidatePath("/staff/fixed-shifts");
}
