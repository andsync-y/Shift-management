import { requireAdmin } from "@/lib/auth";
import { loadPreopenData } from "@/lib/preopen-data";
import PreopenBooking from "../../staff/preopen/PreopenBooking";
import PreopenRoster from "../../staff/preopen/PreopenRoster";
import PreopenShiftEditor from "./PreopenShiftEditor";

export default async function AdminPreopenPage() {
  const me = await requireAdmin();
  const { profiles, reservations, shifts, capacities, staffingByDate, colors } =
    await loadPreopenData();

  const staffOnly = profiles.filter((p) => p.role === "staff");

  return (
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Pre-Open</div>
          <h1 className="ttl en">Mock Booking</h1>
          <p className="sub">プレオープン モデル客の予約状況（最終受付19:00・施術90分）</p>
        </div>
      </div>

      <PreopenRoster staffingByDate={staffingByDate} colors={colors} />
      <PreopenShiftEditor
        key={shifts.map((s) => s.id).join("-") || "empty"}
        staff={staffOnly}
        shifts={shifts}
      />
      <PreopenBooking
        meId={me.id}
        meName={me.full_name}
        staff={profiles}
        reservations={reservations}
        capacities={capacities}
        isAdmin
      />
    </div>
  );
}
