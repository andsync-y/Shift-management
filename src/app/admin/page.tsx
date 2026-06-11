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

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ count: staffCount }, { count: pendingCount }, { data: periods }] =
    await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "staff"),
      supabase
        .from("time_off_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      // 前月/次月ナビのため全期間を新しい順に取得（表示リストは後で5件に絞る）
      supabase
        .from("shift_periods")
        .select("*")
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .limit(60),
    ]);

  // 表示する期間を決める。
  // ・?period=<id> があればその月を表示（前月/次月ボタンで切り替え）。
  // ・無ければ「シフトが実際に入っている最新の月」を自動表示（直近が空なら手前の月）。
  const periodList = periods ?? [];
  let latest = periodList[0] ?? null;
  let latestShifts: Shift[] = [];
  let staffList: Profile[] = [];

  if (periodList.length > 0) {
    const fromParam = sp.period ? periodList.find((p) => p.id === sp.period) : undefined;

    if (fromParam) {
      latest = fromParam;
    } else {
      // 既定は「今月（JST）」。今月の期間があればそれを表示する。
      const jst = new Date(Date.now() + 9 * 3600 * 1000);
      const curY = jst.getUTCFullYear();
      const curM = jst.getUTCMonth() + 1;
      const thisMonth = periodList.find((p) => p.year === curY && p.month === curM);
      if (thisMonth) {
        latest = thisMonth;
      } else {
        // 今月の期間が無ければ、直近5件で最初にシフトが入っている月にフォールバック
        const recent = periodList.slice(0, 5);
        const { data: probe } = await supabase
          .from("shifts")
          .select("period_id")
          .in(
            "period_id",
            recent.map((p) => p.id)
          );
        const have = new Set((probe ?? []).map((s) => (s as { period_id: string }).period_id));
        latest = recent.find((p) => have.has(p.id)) ?? periodList[0];
      }
    }

    const { data: staff } = await supabase.from("profiles").select("*");
    staffList = (staff ?? []) as Profile[];

    const { data: monthShifts } = await supabase
      .from("shifts")
      .select("*")
      .eq("period_id", latest.id);
    latestShifts = (monthShifts ?? []) as Shift[];
  }

  // 前月（より古い）/ 次月（より新しい）の期間。periodList は新しい順。
  const curIdx = latest ? periodList.findIndex((p) => p.id === latest!.id) : -1;
  const newerPeriod = curIdx > 0 ? periodList[curIdx - 1] : null;
  const olderPeriod =
    curIdx >= 0 && curIdx < periodList.length - 1 ? periodList[curIdx + 1] : null;

  // 表示中の期間の必要人数（人手不足アラート用）と承認済み休み
  let requirements: ShiftRequirement[] = [];
  let timeOff: TimeOffRequest[] = [];
  if (latest) {
    const monthStart = `${latest.year}-${String(latest.month).padStart(2, "0")}-01`;
    const monthEnd = `${latest.year}-${String(latest.month).padStart(2, "0")}-${String(
      new Date(latest.year, latest.month, 0).getDate()
    ).padStart(2, "0")}`;
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
      <div className="stat-strip">
        <Link href="/admin/staff" className="stat-mini">
          <div>
            <div className="eyebrow">Active Staff</div>
            <div className="stat-mini-sub">スタッフ管理</div>
          </div>
          <div className="stat-mini-num en">
            {staffCount ?? 0}
            <small>名</small>
          </div>
        </Link>

        <Link href="/admin/requests" className="stat-mini">
          <div>
            <div className="eyebrow">Pending Time-off</div>
            <div className="stat-mini-sub">休み希望を確認</div>
          </div>
          <div className="stat-mini-num en">
            {pendingCount ?? 0}
            <small>件</small>
          </div>
        </Link>
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
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {olderPeriod ? (
                <Link href={`/admin?period=${olderPeriod.id}`} className="btn-link">
                  <span className="arrow">←</span> 前月
                </Link>
              ) : (
                <span className="btn-link" style={{ opacity: 0.35, pointerEvents: "none" }}>
                  <span className="arrow">←</span> 前月
                </span>
              )}
              {newerPeriod ? (
                <Link href={`/admin?period=${newerPeriod.id}`} className="btn-link">
                  次月 <span className="arrow">→</span>
                </Link>
              ) : (
                <span className="btn-link" style={{ opacity: 0.35, pointerEvents: "none" }}>
                  次月 <span className="arrow">→</span>
                </span>
              )}
              <Link href={`/admin/shifts/${latest.id}`} className="btn-link">
                編集 <span className="arrow">→</span>
              </Link>
            </div>
          </div>
          <div className="section-body">
            {latestShifts.length > 0 || timeOff.length > 0 ? (
              <>
                {latestShifts.length === 0 && (
                  <p className="help" style={{ marginTop: 0, marginBottom: 16 }}>
                    まだシフトはありません（承認済みのお休みのみ表示中）。シフト作成画面で生成してください。
                  </p>
                )}
                <ShiftCalendarView
                  year={latest.year}
                  month={latest.month}
                  shifts={latestShifts}
                  staff={staffList}
                  timeOff={timeOff}
                />
              </>
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
              {periods.slice(0, 5).map((p) => (
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
