import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PreopenReservation, Profile } from "@/lib/types";
import PreopenBooking from "./PreopenBooking";

export default async function PreopenPage() {
  const me = await requireUser();
  const supabase = await createClient();

  const [{ data: staff }, { data: reservations }] = await Promise.all([
    supabase.from("profiles").select("id, full_name"),
    supabase
      .from("preopen_reservations")
      .select("*")
      .order("reserve_date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  return (
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Pre-Open</div>
          <h1 className="ttl en">Mock Booking</h1>
          <p className="sub">プレオープン モデル客の予約（各枠 4名まで・施術90分）</p>
        </div>
        <Link href="/staff" className="btn-outline">
          シフトへ戻る
        </Link>
      </div>

      <PreopenBooking
        meId={me.id}
        meName={me.full_name}
        staff={(staff ?? []) as Pick<Profile, "id" | "full_name">[]}
        reservations={(reservations ?? []) as PreopenReservation[]}
      />
    </div>
  );
}
