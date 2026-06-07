"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type TcResult = { ok: boolean; message: string };

// datetime-local（"YYYY-MM-DDTHH:MM"・JSTとみなす）→ ISO(UTC)
function jstLocalToIso(v: string): string | null {
  if (!v) return null;
  const iso = new Date(`${v}:00+09:00`);
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
}
function jstDateOf(iso: string): string {
  const jst = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(
    jst.getUTCDate()
  ).padStart(2, "0")}`;
}

const addSchema = z.object({
  staff_id: z.string().uuid(),
  clock_in: z.string().min(1),
  clock_out: z.string().optional().or(z.literal("")),
});

export async function addTimeRecord(_prev: TcResult | null, formData: FormData): Promise<TcResult> {
  await requireAdmin();
  const parsed = addSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "入力を確認してください。" };
  const inIso = jstLocalToIso(parsed.data.clock_in);
  if (!inIso) return { ok: false, message: "出勤時刻が不正です。" };
  const outIso = parsed.data.clock_out ? jstLocalToIso(parsed.data.clock_out) : null;
  if (parsed.data.clock_out && !outIso) return { ok: false, message: "退勤時刻が不正です。" };
  if (outIso && outIso <= inIso) return { ok: false, message: "退勤は出勤より後にしてください。" };

  const supabase = await createClient();
  const { error } = await supabase.from("time_records").insert({
    staff_id: parsed.data.staff_id,
    work_date: jstDateOf(inIso),
    clock_in: inIso,
    clock_out: outIso,
    source: "manual",
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/timecards");
  return { ok: true, message: "勤怠を追加しました。" };
}

export async function updateTimeRecord(
  id: string,
  clockInLocal: string,
  clockOutLocal: string
): Promise<TcResult> {
  await requireAdmin();
  const inIso = jstLocalToIso(clockInLocal);
  if (!inIso) return { ok: false, message: "出勤時刻が不正です。" };
  const outIso = clockOutLocal ? jstLocalToIso(clockOutLocal) : null;
  if (clockOutLocal && !outIso) return { ok: false, message: "退勤時刻が不正です。" };
  if (outIso && outIso <= inIso) return { ok: false, message: "退勤は出勤より後にしてください。" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("time_records")
    .update({ clock_in: inIso, clock_out: outIso, work_date: jstDateOf(inIso), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/timecards");
  return { ok: true, message: "勤怠を更新しました。" };
}

export async function deleteTimeRecord(id: string): Promise<TcResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("time_records").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/timecards");
  return { ok: true, message: "削除しました。" };
}
