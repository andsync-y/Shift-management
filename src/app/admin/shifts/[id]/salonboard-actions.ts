"use server";

import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSalonBoardClient } from "@/lib/salonboard";
import type { Profile, Shift } from "@/lib/types";

export interface SalonBoardActionResult {
  ok: boolean;
  pushed: number;
  failed: number;
  message: string;
}

// 確定済み期間のシフトをサロンボードへ反映する。
export async function pushToSalonBoard(
  periodId: string
): Promise<SalonBoardActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: period } = await supabase
    .from("shift_periods")
    .select("status")
    .eq("id", periodId)
    .single();

  if (!period || period.status !== "confirmed") {
    return {
      ok: false,
      pushed: 0,
      failed: 0,
      message: "確定済みのシフトのみ反映できます。先にシフトを確定してください。",
    };
  }

  const [{ data: shifts }, { data: staff }] = await Promise.all([
    supabase.from("shifts").select("*").eq("period_id", periodId),
    supabase.from("profiles").select("*"),
  ]);

  const client = await getSalonBoardClient((staff ?? []) as Profile[]);
  const result = await client.pushShifts((shifts ?? []) as Shift[]);
  return result;
}
