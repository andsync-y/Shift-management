"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const slotSchema = z.object({
  day_of_week: z.coerce.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  preference: z.enum(["preferred", "available", "unavailable"]),
});

// 希望シフトを1件追加（本人 or 管理者）
export async function addAvailability(staffId: string, formData: FormData) {
  const me = await requireUser();
  if (me.role !== "super_admin" && me.id !== staffId) {
    return { ok: false, message: "権限がありません。" };
  }

  const parsed = slotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "入力内容を確認してください。" };
  }
  if (parsed.data.start_time >= parsed.data.end_time) {
    return { ok: false, message: "終了時刻は開始時刻より後にしてください。" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("availability_preferences")
    .insert({ staff_id: staffId, ...parsed.data });

  if (error) return { ok: false, message: error.message };

  revalidatePath(`/admin/staff/${staffId}`);
  revalidatePath("/staff/availability");
  return { ok: true, message: "希望シフトを追加しました。" };
}

export async function deleteAvailability(id: string, staffId: string) {
  const me = await requireUser();
  if (me.role !== "super_admin" && me.id !== staffId) return;

  const supabase = await createClient();
  await supabase.from("availability_preferences").delete().eq("id", id);
  revalidatePath(`/admin/staff/${staffId}`);
  revalidatePath("/staff/availability");
}
