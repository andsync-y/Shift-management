import { createClient } from "@/lib/supabase/server";
import type { Profile, RequestStatus, TimeOffRequest } from "@/lib/types";
import RequestRow from "./RequestRow";

function fmtRange(r: TimeOffRequest): string {
  if (!r.start_time || !r.end_time) return "終日";
  return `${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}`;
}

export default async function AdminRequestsPage() {
  const supabase = await createClient();

  const [{ data: requests }, { data: staff }] = await Promise.all([
    supabase
      .from("time_off_requests")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("*"),
  ]);

  const staffMap = new Map((staff as Profile[] | null)?.map((s) => [s.id, s]) ?? []);
  const list = (requests ?? []) as TimeOffRequest[];
  const pending = list.filter((r) => r.status === "pending");

  return (
    <div className="page space-y-6">
      <div className="masthead" style={{ marginBottom: 8 }}>
        <div className="eyebrow accent">Owner Console</div>
        <h1 className="ttl en">Requests</h1>
        <p className="sub">休み希望の管理</p>
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold">
          未対応：{pending.length}件 / 全{list.length}件
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">スタッフ</th>
                <th className="py-2 pr-4">日付</th>
                <th className="py-2 pr-4">時間</th>
                <th className="py-2 pr-4">理由</th>
                <th className="py-2 pr-4">状態</th>
                <th className="py-2 pr-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <RequestRow
                  key={r.id}
                  id={r.id}
                  staffName={staffMap.get(r.staff_id)?.full_name ?? "?"}
                  offDate={r.off_date}
                  timeRange={fmtRange(r)}
                  reason={r.reason ?? ""}
                  status={r.status as RequestStatus}
                />
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-gray-400">
                    休み希望はまだありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
