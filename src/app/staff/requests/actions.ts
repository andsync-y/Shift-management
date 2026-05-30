"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  off_dates: z.string().min(1, "日付を選択してください"), // カンマ区切りの複数日
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
  const { off_dates, all_day, start_time, end_time, reason } = parsed.data;

  const dates = Array.from(
    new Set(off_dates.split(",").map((d) => d.trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))
  ).sort();
  if (dates.length === 0) {
    return { ok: false, message: "日付を選択してください。" };
  }

  const isAllDay = all_day === "on";
  if (!isAllDay && (!start_time || !end_time)) {
    return { ok: false, message: "時間帯休みの場合は開始・終了時刻を入力してください。" };
  }

  const supabase = await createClient();

  // 各日付の月から period を特定（あれば紐付け）。月ごとに1回だけ問い合わせ。
  const periodByMonth = new Map<string, string | null>();
  for (const d of dates) {
    const [y, m] = d.split("-").map(Number);
    const key = `${y}-${m}`;
    if (!periodByMonth.has(key)) {
      const { data: period } = await supabase
        .from("shift_periods")
        .select("id")
        .eq("year", y)
        .eq("month", m)
        .maybeSingle();
      periodByMonth.set(key, period?.id ?? null);
    }
  }

  const rows = dates.map((off_date) => {
    const [y, m] = off_date.split("-").map(Number);
    return {
      staff_id: me.id,
      period_id: periodByMonth.get(`${y}-${m}`) ?? null,
      off_date,
      start_time: isAllDay ? null : start_time,
      end_time: isAllDay ? null : end_time,
      reason: reason || null,
    };
  });

  const { error } = await supabase.from("time_off_requests").insert(rows);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/staff/requests");
  return {
    ok: true,
    message: `お休み希望を${rows.length}件申請しました。`,
  };
}

export async function cancelTimeOff(id: string) {
  const me = await requireUser();
  const supabase = await createClient();
  // RLS により本人の pending のみ削除可能（管理者は別途）
  await supabase.from("time_off_requests").delete().eq("id", id).eq("staff_id", me.id);
  revalidatePath("/staff/requests");
}
