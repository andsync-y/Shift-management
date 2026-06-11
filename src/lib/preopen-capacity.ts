// プレオープン各枠の「受付数」をサーバー側で算出する。
// 受付数 = min(ベッド数, その枠の間ずっと勤務しているスタッフ数)。
// 勤務時間は固定シフト（希望の勤務形態。例: 紙坂は水木 16:00 まで）を使う。
// fixed_shifts は本人/管理者しか読めない RLS のため service role で読む。

import { createAdminClient } from "@/lib/supabase/server";
import { PREOPEN_BEDS, PREOPEN_DAYS, hm, slotKey } from "@/lib/preopen";

export async function getPreopenCapacities(): Promise<Record<string, number>> {
  const admin = createAdminClient();

  const { data: staff } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "staff")
    .eq("is_active", true);
  const staffIds = ((staff ?? []) as { id: string }[]).map((s) => s.id);

  const { data: fixed } = staffIds.length
    ? await admin
        .from("fixed_shifts")
        .select("staff_id, day_of_week, start_time, end_time")
        .in("staff_id", staffIds)
    : { data: [] };
  const shifts = (fixed ?? []) as {
    staff_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
  }[];

  const capacities: Record<string, number> = {};
  for (const day of PREOPEN_DAYS) {
    const dow = new Date(`${day.date}T00:00:00`).getDay();
    for (const round of day.rounds) {
      // 枠の開始から終了まで在席しているスタッフ（同一人物の複数枠は1人と数える）
      const onDuty = new Set(
        shifts
          .filter(
            (s) =>
              s.day_of_week === dow &&
              hm(s.start_time) <= round.start &&
              hm(s.end_time) >= round.end
          )
          .map((s) => s.staff_id)
      );
      capacities[slotKey(day.date, round.start)] = Math.min(PREOPEN_BEDS, onDuty.size);
    }
  }
  return capacities;
}
