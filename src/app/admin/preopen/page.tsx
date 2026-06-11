import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PreopenReservation, Profile } from "@/lib/types";
import { getPreopenCapacities } from "@/lib/preopen";
import PreopenBooking from "../../staff/preopen/PreopenBooking";
import PreopenRoster from "../../staff/preopen/PreopenRoster";
import PreopenAvailability from "../../staff/preopen/PreopenAvailability";

function surname(name: string) {
  return name.split(/[\s　]/)[0];
}

export default async function AdminPreopenPage() {
  const me = await requireAdmin();
  const supabase = await createClient();

  const [{ data: staff }, { data: reservations }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, display_color"),
    supabase
      .from("preopen_reservations")
      .select("*")
      .order("reserve_date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  const capacities = getPreopenCapacities();
  const list = (reservations ?? []) as PreopenReservation[];
  const profiles = (staff ?? []) as (Pick<Profile, "id" | "full_name" | "role"> & {
    display_color: string;
  })[];
  const colors: Record<string, string> = Object.fromEntries(
    profiles.map((p) => [surname(p.full_name), p.display_color])
  );

  return (
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Pre-Open</div>
          <h1 className="ttl en">Mock Booking</h1>
          <p className="sub">プレオープン モデル客の予約状況（最終受付19:00・施術90分）</p>
        </div>
      </div>

      <PreopenRoster colors={colors} />
      <PreopenAvailability reservations={list} capacities={capacities} />
      <PreopenBooking
        meId={me.id}
        meName={me.full_name}
        staff={profiles}
        reservations={list}
        capacities={capacities}
        isAdmin
      />
    </div>
  );
}
