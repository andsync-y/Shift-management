import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadPreopenData } from "@/lib/preopen-data";
import PreopenBooking from "./PreopenBooking";
import PreopenRoster from "./PreopenRoster";

export default async function PreopenPage() {
  const me = await requireUser();
  const { profiles, reservations, capacities, staffingByDate, colors } = await loadPreopenData();

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

      <PreopenRoster staffingByDate={staffingByDate} colors={colors} />
      <PreopenBooking
        meId={me.id}
        meName={me.full_name}
        staff={profiles}
        reservations={reservations}
        capacities={capacities}
      />
    </div>
  );
}
