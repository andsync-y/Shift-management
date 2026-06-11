import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PreopenReservation, Profile } from "@/lib/types";
import { getPreopenCapacities } from "@/lib/preopen";
import PreopenBooking from "./PreopenBooking";
import PreopenRoster from "./PreopenRoster";

export default async function PreopenPage() {
  const me = await requireUser();
  const supabase = await createClient();

  const [{ data: staff }, { data: reservations }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role"),
    supabase
      .from("preopen_reservations")
      .select("*")
      .order("reserve_date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  const capacities = getPreopenCapacities();

  return (
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Pre-Open</div>
          <h1 className="ttl en">Mock Booking</h1>
          <p className="sub">プレオープン モデル客の予約（最終受付19:00・施術90分）</p>
        </div>
        <Link href="/staff" className="btn-outline">
          シフトへ戻る
        </Link>
      </div>

      <PreopenRoster />

      <PreopenBooking
        meId={me.id}
        meName={me.full_name}
        staff={(staff ?? []) as Pick<Profile, "id" | "full_name" | "role">[]}
        reservations={(reservations ?? []) as PreopenReservation[]}
        capacities={capacities}
      />
    </div>
  );
}
