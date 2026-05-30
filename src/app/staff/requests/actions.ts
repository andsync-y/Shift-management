"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  off_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を選択してください"),
  all_day: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  reason: z.string().optional(),
});

export async function submitTimeOff(_prev: unknown, formData: FormData) {
  const me = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const { off_date, all_day, start_time, end_time, reason } = parsed.data;

  const isAllDay = all_day === "on";
  if (!isAllDay && (!start_time || !end_time)) {
    return { ok: false, message: "時間帯休みの場合は開始・終了時刻を入力してください。" };
  }

  const supabase = await createClient();

  // 該当日付の月から period を特定（あれば紐付け）
  const [y, m] = off_date.split("-").map(Number);
  const { data: period } = await supabase
    .from("shift_periods")
    .select("id")
    .eq("year", y)
    .eq("month", m)
    .maybeSingle();

  const { error } = await supabase.from("time_off_requests").insert({
    staff_id: me.id,
    period_id: period?.id ?? null,
    off_date,
    start_time: isAllDay ? null : start_time,
    end_time: isAllDay ? null : end_time,
    reason: reason || null,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath("/staff/requests");
  return { ok: true, message: "お休み希望を申請しました。" };
}

export async function cancelTimeOff(id: string) {
  const me = await requireUser();
  const supabase = await createClient();
  // RLS により本人の pending のみ削除可能（管理者は別途）
  await supabase.from("time_off_requests").delete().eq("id", id).eq("staff_id", me.id);
  revalidatePath("/staff/requests");
}
