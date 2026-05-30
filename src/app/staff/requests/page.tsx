import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { TimeOffRequest } from "@/lib/types";
import TimeOffForm from "./TimeOffForm";
import TimeOffList from "./TimeOffList";

export default async function StaffRequestsPage() {
  const me = await requireUser();
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("time_off_requests")
    .select("*")
    .eq("staff_id", me.id)
    .order("off_date", { ascending: false });

  return (
    <div className="page space-y-6">
      <div className="masthead" style={{ marginBottom: 8 }}>
        <div className="eyebrow accent">Staff</div>
        <h1 className="ttl en">Time Off</h1>
        <p className="sub">お休み希望</p>
      </div>

      <div className="card">
        <h2 className="mb-4 font-semibold">新規申請</h2>
        <TimeOffForm />
      </div>

      <div className="card">
        <h2 className="mb-4 font-semibold">申請履歴</h2>
        <TimeOffList requests={(requests ?? []) as TimeOffRequest[]} />
      </div>
    </div>
  );
}
