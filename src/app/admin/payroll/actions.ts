"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// 月ごとの指名本数を保存（オーナーのみ）。指名バック＝単価×本数 が総支給に加算される。
export async function setNominationCount(
  staffId: string,
  month: string,
  count: number
): Promise<{ ok: boolean; message?: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };
  const n = Math.max(0, Math.round(count) || 0);

  const supabase = await createClient();
  const { error } = await supabase
    .from("nomination_counts")
    .upsert({ staff_id: staffId, month, count: n }, { onConflict: "staff_id,month" });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/payroll");
  return { ok: true };
}
