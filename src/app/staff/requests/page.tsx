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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">お休み希望</h1>

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
