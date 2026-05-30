import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  PERIOD_STATUS_LABELS_JA,
  type Profile,
  type Shift,
} from "@/lib/types";
import ShiftCalendarView from "@/components/ShiftCalendarView";

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [{ count: staffCount }, { count: pendingCount }, { data: periods }] =
    await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "staff"),
      supabase
        .from("time_off_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("shift_periods")
        .select("*")
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .limit(5),
    ]);

  // 最新のシフト期間のカレンダーをダッシュボードに表示
  const latest = periods?.[0];
  let latestShifts: Shift[] = [];
  let staffList: Profile[] = [];
  if (latest) {
    const [{ data: shifts }, { data: staff }] = await Promise.all([
      supabase.from("shifts").select("*").eq("period_id", latest.id),
      supabase.from("profiles").select("*"),
    ]);
    latestShifts = (shifts ?? []) as Shift[];
    staffList = (staff ?? []) as Profile[];
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-gray-500">登録スタッフ</p>
          <p className="mt-1 text-3xl font-bold">{staffCount ?? 0}<span className="ml-1 text-base font-normal text-gray-400">名</span></p>
          <Link href="/admin/staff" className="mt-2 inline-block text-sm text-brand hover:underline">
            スタッフ管理 →
          </Link>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">未対応の休み希望</p>
          <p className="mt-1 text-3xl font-bold">{pendingCount ?? 0}<span className="ml-1 text-base font-normal text-gray-400">件</span></p>
          <Link href="/admin/requests" className="mt-2 inline-block text-sm text-brand hover:underline">
            休み希望を確認 →
          </Link>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">シフト作成</p>
          <p className="mt-1 text-base text-gray-700">AIで月次シフトを自動生成</p>
          <Link href="/admin/shifts" className="mt-2 inline-block text-sm text-brand hover:underline">
            シフト作成へ →
          </Link>
        </div>
      </div>

      {latest && (
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">
              {latest.year}年{latest.month}月 のシフト
            </h2>
            <Link
              href={`/admin/shifts/${latest.id}`}
              className="text-sm text-brand hover:underline"
            >
              編集 →
            </Link>
          </div>
          {latestShifts.length > 0 ? (
            <ShiftCalendarView
              year={latest.year}
              month={latest.month}
              shifts={latestShifts}
              staff={staffList}
            />
          ) : (
            <p className="text-sm text-gray-400">
              このシフト期間にはまだシフトがありません。シフト作成画面で生成してください。
            </p>
          )}
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-semibold">最近のシフト期間</h2>
        {periods && periods.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {periods.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <Link href={`/admin/shifts/${p.id}`} className="text-sm hover:text-brand">
                  {p.year}年{p.month}月
                </Link>
                <span className="badge bg-gray-100 text-gray-600">
                  {PERIOD_STATUS_LABELS_JA[p.status as keyof typeof PERIOD_STATUS_LABELS_JA]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">まだシフト期間がありません。</p>
        )}
      </div>
    </div>
  );
}
