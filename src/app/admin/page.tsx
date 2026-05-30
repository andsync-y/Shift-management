import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  PERIOD_STATUS_LABELS_JA,
  type Profile,
  type Shift,
} from "@/lib/types";
import ShiftCalendarView from "@/components/ShiftCalendarView";
import DashboardInsights from "@/components/DashboardInsights";
import type { ShiftRequirement, TimeOffRequest } from "@/lib/types";

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

  // シフトが実際に入っている最新の期間をダッシュボードに表示する。
  // （直近の期間がまだ空＝下書きの場合は、その手前の入っている月を出す）
  const periodList = periods ?? [];
  let latest = periodList[0] ?? null;
  let latestShifts: Shift[] = [];
  let staffList: Profile[] = [];

  if (periodList.length > 0) {
    const { data: staff } = await supabase.from("profiles").select("*");
    staffList = (staff ?? []) as Profile[];

    // 候補期間のシフトをまとめて取得し、新しい順に「シフトがある月」を採用
    const ids = periodList.map((p) => p.id);
    const { data: allShifts } = await supabase
      .from("shifts")
      .select("*")
      .in("period_id", ids);
    const shiftsByPeriod = new Map<string, Shift[]>();
    for (const s of (allShifts ?? []) as Shift[]) {
      if (!shiftsByPeriod.has(s.period_id)) shiftsByPeriod.set(s.period_id, []);
      shiftsByPeriod.get(s.period_id)!.push(s);
    }
    const withShifts = periodList.find((p) => (shiftsByPeriod.get(p.id)?.length ?? 0) > 0);
    latest = withShifts ?? periodList[0];
    latestShifts = shiftsByPeriod.get(latest.id) ?? [];
  }

  // 表示中の期間の必要人数（人手不足アラート用）と承認済み休み
  let requirements: ShiftRequirement[] = [];
  let timeOff: TimeOffRequest[] = [];
  if (latest) {
    const monthStart = `${latest.year}-${String(latest.month).padStart(2, "0")}-01`;
    const monthEnd = `${latest.year}-${String(latest.month).padStart(2, "0")}-31`;
    const [{ data: reqs }, { data: offs }] = await Promise.all([
      supabase.from("shift_requirements").select("*").eq("period_id", latest.id),
      supabase
        .from("time_off_requests")
        .select("*")
        .eq("status", "approved")
        .gte("off_date", monthStart)
        .lte("off_date", monthEnd),
    ]);
    requirements = (reqs ?? []) as ShiftRequirement[];
    timeOff = (offs ?? []) as TimeOffRequest[];
  }

  return (
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Owner Console</div>
          <h1 className="ttl en">Dashboard</h1>
          <p className="sub">
            ダッシュボード{latest ? ` — ${latest.year}年${latest.month}月` : ""}
          </p>
        </div>
        <Link href="/admin/shifts" className="btn-outline">
          シフトを作成 <span className="arrow">→</span>
        </Link>
      </div>

      {/* summary (compact quick links) */}
      <div className="summary-grid" style={{ gridTemplateColumns: "repeat(2,1fr)", marginBottom: 24 }}>
        <div className="stat" style={{ minHeight: 0, padding: "22px 24px" }}>
          <div className="eyebrow">Active Staff</div>
          <div className="big en" style={{ fontSize: 40, margin: "14px 0 0" }}>
            {staffCount ?? 0}
            <small>名</small>
          </div>
          <div className="act" style={{ marginTop: 14 }}>
            <Link href="/admin/staff" className="btn-link">
              スタッフ管理 <span className="arrow">→</span>
            </Link>
          </div>
        </div>

        <div className="stat" style={{ minHeight: 0, padding: "22px 24px" }}>
          <div className="eyebrow">Pending Time-off</div>
          <div className="big en" style={{ fontSize: 40, margin: "14px 0 0" }}>
            {pendingCount ?? 0}
            <small>件</small>
          </div>
          <div className="act" style={{ marginTop: 14 }}>
            <Link href="/admin/requests" className="btn-link">
              休み希望を確認 <span className="arrow">→</span>
            </Link>
          </div>
        </div>
      </div>

      {/* insights: 今日明日の出勤者 / 人手不足 / 勤務状況 / 集計 */}
      {latest && (
        <DashboardInsights
          periodId={latest.id}
          shifts={latestShifts}
          staff={staffList}
          requirements={requirements}
        />
      )}

      {/* calendar */}
      {latest && (
        <div className="section">
          <div className="section-head">
            <h2>
              {latest.year}年{latest.month}月 のシフト
            </h2>
            <Link href={`/admin/shifts/${latest.id}`} className="btn-link">
              編集 <span className="arrow">→</span>
            </Link>
          </div>
          <div className="section-body">
            {latestShifts.length > 0 ? (
              <ShiftCalendarView
                year={latest.year}
                month={latest.month}
                shifts={latestShifts}
                staff={staffList}
                timeOff={timeOff}
              />
            ) : (
              <p className="help" style={{ marginTop: 0 }}>
                このシフト期間にはまだシフトがありません。シフト作成画面で生成してください。
              </p>
            )}
          </div>
        </div>
      )}

      {/* period list */}
      <div className="section">
        <div className="section-head">
          <h2>最近のシフト期間</h2>
          <span className="eyebrow">Periods</span>
        </div>
        <div className="section-body" style={{ paddingTop: 6 }}>
          {periods && periods.length > 0 ? (
            <div className="period-list">
              {periods.map((p) => (
                <div className="period-status" key={p.id}>
                  <Link href={`/admin/shifts/${p.id}`} className="ym en">
                    {p.year}.{String(p.month).padStart(2, "0")}
                  </Link>
                  <span className="soft" style={{ fontSize: 13 }}>
                    {p.year}年{p.month}月
                  </span>
                  <span className="tag">
                    {PERIOD_STATUS_LABELS_JA[p.status as keyof typeof PERIOD_STATUS_LABELS_JA]}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="help" style={{ marginTop: 0 }}>
              まだシフト期間がありません。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
