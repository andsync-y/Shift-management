import { createClient } from "@/lib/supabase/server";
import {
  PREOPEN_DAYS,
  computeCapacities,
  hm,
  type PreopenShiftRow,
} from "@/lib/preopen";
import type { PreopenReservation, PreopenShift, Profile } from "@/lib/types";
import type { RosterBar } from "@/app/staff/preopen/PreopenRoster";

function surname(name: string) {
  return name.split(/[\s　]/)[0];
}

export type PreopenProfile = Pick<Profile, "id" | "full_name" | "role"> & {
  display_color: string;
};

export type PreopenData = {
  profiles: PreopenProfile[];
  reservations: PreopenReservation[];
  shifts: PreopenShift[];
  capacities: Record<string, number>;
  staffingByDate: Record<string, RosterBar[]>;
  colors: Record<string, string>;
};

// スタッフ/オーナー両画面で使う、プレオープンの表示データを一括取得する。
export async function loadPreopenData(): Promise<PreopenData> {
  const supabase = await createClient();
  const [{ data: profilesRaw }, { data: reservationsRaw }, { data: shiftsRaw }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, display_color"),
    supabase
      .from("preopen_reservations")
      .select("*")
      .order("reserve_date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("preopen_shifts")
      .select("*")
      .order("reserve_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  const profiles = (profilesRaw ?? []) as PreopenProfile[];
  const reservations = (reservationsRaw ?? []) as PreopenReservation[];
  const shifts = (shiftsRaw ?? []) as PreopenShift[];

  const colors: Record<string, string> = Object.fromEntries(
    profiles.map((p) => [surname(p.full_name), p.display_color])
  );
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const staffingByDate: Record<string, RosterBar[]> = {};
  for (const day of PREOPEN_DAYS) staffingByDate[day.date] = [];
  for (const s of shifts) {
    const p = byId.get(s.staff_id);
    if (!p || !staffingByDate[s.reserve_date]) continue;
    staffingByDate[s.reserve_date].push({
      name: surname(p.full_name),
      start: hm(s.start_time),
      end: hm(s.end_time),
      isTraining: s.is_training,
      canServe: s.can_serve !== false,
    });
  }
  // 開始時刻→名前 で安定ソート
  for (const date of Object.keys(staffingByDate)) {
    staffingByDate[date].sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  }

  const capacities = computeCapacities(shifts as unknown as PreopenShiftRow[]);

  return { profiles, reservations, shifts, capacities, staffingByDate, colors };
}
