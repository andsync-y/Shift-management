import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile, StaffBlackout } from "@/lib/types";
import BlackoutManager from "./BlackoutManager";

export default async function BlackoutsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: staff }, { data: blackouts }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("is_active", true).eq("role", "staff"),
    supabase
      .from("staff_blackouts")
      .select("*")
      .order("blackout_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  return (
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Schedule</div>
          <h1 className="ttl en">Personal Blackouts</h1>
          <p className="sub">個別予定の取り込み（タイムツリー）— その時間はシフトを割り当てません</p>
        </div>
      </div>

      <BlackoutManager
        staff={(staff ?? []) as Pick<Profile, "id" | "full_name">[]}
        blackouts={(blackouts ?? []) as StaffBlackout[]}
      />
    </div>
  );
}
