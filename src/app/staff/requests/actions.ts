"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  off_dates: z.string().min(1, "日付を選択してください"), // カンマ区切りの複数日
  request_type: z.enum(["off", "time_change"]).default("off"),
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
  const { off_dates, request_type, all_day, start_time, end_time, reason } = parsed.data;

  const dates = Array.from(
    new Set(off_dates.split(",").map((d) => d.trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))
  ).sort();
  if (dates.length === 0) {
    return { ok: false, message: "日付を選択してください。" };
  }

  const isTimeChange = request_type === "time_change";
  const isAllDay = !isTimeChange && all_day === "on";

  // 時間変更は「希望する新しい勤務時間」、時間帯休みは「休む時間帯」が必須
  if ((isTimeChange || !isAllDay) && (!start_time || !end_time)) {
    return {
      ok: false,
      message: isTimeChange
        ? "希望する勤務時間（開始・終了）を入力してください。"
        : "時間帯休みの場合は開始・終了時刻を入力してください。",
    };
  }
  if (start_time && end_time && start_time >= end_time) {
    return { ok: false, message: "終了時刻は開始時刻より後にしてください。" };
  }

  const supabase = await createClient();

  // すでに申請済み（却下以外＝申請中/承認済み）の日付は重複申請させない
  const { data: existing } = await supabase
    .from("time_off_requests")
    .select("off_date")
    .eq("staff_id", me.id)
    .neq("status", "rejected")
    .in("off_date", dates);
  const taken = new Set((existing ?? []).map((r) => (r as { off_date: string }).off_date));
  const newDates = dates.filter((d) => !taken.has(d));

  const fmt = (d: string) => {
    const [, m, day] = d.split("-");
    return `${Number(m)}/${Number(day)}`;
  };
  if (newDates.length === 0) {
    return {
      ok: false,
      message: `その日付はすでに申請済みです（${dates.map(fmt).join("・")}）。重複申請はできません。`,
    };
  }

  // 各日付の月から period を特定（あれば紐付け）。月ごとに1回だけ問い合わせ。
  const periodByMonth = new Map<string, string | null>();
  for (const d of newDates) {
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

  const rows = newDates.map((off_date) => {
    const [y, m] = off_date.split("-").map(Number);
    return {
      staff_id: me.id,
      period_id: periodByMonth.get(`${y}-${m}`) ?? null,
      off_date,
      request_type,
      start_time: isAllDay ? null : start_time,
      end_time: isAllDay ? null : end_time,
      reason: reason || null,
    };
  });

  const { error } = await supabase.from("time_off_requests").insert(rows);
  if (error) return { ok: false, message: error.message };

  const skipped = dates.filter((d) => taken.has(d));
  revalidatePath("/staff/requests");
  return {
    ok: true,
    message:
      `${isTimeChange ? "時間変更希望" : "お休み希望"}を${rows.length}件申請しました。` +
      (skipped.length > 0 ? `（申請済みのため除外：${skipped.map(fmt).join("・")}）` : ""),
  };
}

export async function cancelTimeOff(id: string) {
  const me = await requireUser();
  const supabase = await createClient();
  // RLS により本人の pending のみ削除可能（管理者は別途）
  await supabase.from("time_off_requests").delete().eq("id", id).eq("staff_id", me.id);
  revalidatePath("/staff/requests");
}
