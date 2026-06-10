import Link from "next/link";
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
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Staff</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>
            Time Off
          </h1>
          <p className="sub">お休み希望 — {me.full_name}</p>
        </div>
        <Link href="/staff" className="btn-outline">
          シフト確認 <span className="arrow">→</span>
        </Link>
      </div>

      <TimeOffForm />

      <div className="section">
        <div className="section-head">
          <h2>申請履歴</h2>
          <span className="eyebrow">History</span>
        </div>
        <div className="section-body" style={{ paddingTop: 6 }}>
          <TimeOffList requests={(requests ?? []) as TimeOffRequest[]} />
        </div>
      </div>
    </div>
  );
}
