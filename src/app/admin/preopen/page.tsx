import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PreopenReservation, Profile } from "@/lib/types";
import { PREOPEN_BEDS, PREOPEN_DAYS, hm } from "@/lib/preopen";
import PreopenBooking from "../../staff/preopen/PreopenBooking";

export default async function AdminPreopenPage() {
  const me = await requireAdmin();
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

  const list = (reservations ?? []) as PreopenReservation[];
  const total = list.length;
  const capacity = PREOPEN_DAYS.reduce((n, d) => n + d.rounds.length * PREOPEN_BEDS, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Pre-Open</div>
          <h1 className="ttl en">Mock Booking</h1>
          <p className="sub">プレオープン モデル客の予約状況（各枠 {PREOPEN_BEDS}名まで）</p>
        </div>
      </div>

      <div className="summary-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
        <div className="stat">
          <div className="eyebrow">予約合計</div>
          <div className="num en">
            {total}
            <span className="soft" style={{ fontSize: 14 }}>
              {" "}
              / {capacity}名
            </span>
          </div>
        </div>
        <div className="stat">
          <div className="eyebrow">満席の枠</div>
          <div className="num en">
            {PREOPEN_DAYS.reduce(
              (n, d) =>
                n +
                d.rounds.filter(
                  (r) =>
                    list.filter((x) => x.reserve_date === d.date && hm(x.start_time) === r.start).length >=
                    PREOPEN_BEDS
                ).length,
              0
            )}
          </div>
        </div>
      </div>

      <PreopenBooking
        meId={me.id}
        meName={me.full_name}
        staff={(staff ?? []) as Pick<Profile, "id" | "full_name">[]}
        reservations={list}
        isAdmin
      />
    </div>
  );
}
