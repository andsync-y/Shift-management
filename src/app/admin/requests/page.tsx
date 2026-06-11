import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  DAY_LABELS_JA,
  REQUEST_STATUS_LABELS_JA,
  type Profile,
  type RequestStatus,
  type Shift,
  type ShiftRequirement,
  type TimeOffRequest,
} from "@/lib/types";
import RequestActions from "./RequestActions";
import CleanupShiftsButton from "./CleanupShiftsButton";

function fmtRange(r: TimeOffRequest): string {
  if (!r.start_time || !r.end_time) return "終日";
  return `${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}`;
}

function typeLabel(r: TimeOffRequest): { label: string; cls: "early" | "late" } {
  return r.request_type === "time_change"
    ? { label: "時間変更", cls: "late" }
    : { label: "休み", cls: "early" };
}

function StatusPill({ status }: { status: RequestStatus }) {
  const cls = status === "approved" ? "ok" : status === "rejected" ? "no" : "wait";
  const dot =
    status === "approved" ? "#3d6b4f" : status === "rejected" ? "#9a3a30" : "#94650e";
  return (
    <span className={`status-pill ${cls}`}>
      <span className="dot" style={{ background: dot }} />
      {REQUEST_STATUS_LABELS_JA[status]}
    </span>
  );
}

function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// 承認済みの「終日休み」を分析し、必要人数を下回る日を洗い出す。
type Gap = { date: string; weekday: number; available: number; required: number };

function findCoverageGaps(
  requests: TimeOffRequest[],
  requirements: ShiftRequirement[],
  activeStaff: number
): { gaps: Gap[]; hasRequirements: boolean } {
  // 曜日ごとの必要人数（その曜日のスロットの最大値を「その日に必要な人数」とみなす）
  const reqByDow = new Map<number, number>();
  for (const r of requirements) {
    reqByDow.set(r.day_of_week, Math.max(reqByDow.get(r.day_of_week) ?? 0, r.required_staff));
  }
  const hasRequirements = reqByDow.size > 0;
  if (!hasRequirements) return { gaps: [], hasRequirements };

  // 承認済みの終日休み（time_change は人員から外れないので除外）を日付ごとに集計
  const offByDate = new Map<string, number>();
  for (const r of requests) {
    if (r.status === "approved" && r.request_type === "off") {
      offByDate.set(r.off_date, (offByDate.get(r.off_date) ?? 0) + 1);
    }
  }

  const gaps: Gap[] = [];
  for (const [date, offCount] of offByDate) {
    const dow = weekdayOf(date);
    const required = reqByDow.get(dow) ?? 0;
    if (required === 0) continue;
    const available = activeStaff - offCount;
    if (available < required) gaps.push({ date, weekday: dow, available, required });
  }
  gaps.sort((a, b) => a.date.localeCompare(b.date));
  return { gaps, hasRequirements };
}

export default async function AdminRequestsPage() {
  const supabase = await createClient();

  const [{ data: requests }, { data: staff }, { data: latestPeriod }] = await Promise.all([
    supabase.from("time_off_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("*"),
    supabase
      .from("shift_periods")
      .select("id")
      .order("year", { ascending: false })
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const { data: requirements } = latestPeriod
    ? await supabase.from("shift_requirements").select("*").eq("period_id", latestPeriod.id)
    : { data: [] };

  const staffList = (staff as Profile[] | null) ?? [];
  const staffMap = new Map(staffList.map((s) => [s.id, s]));
  const activeStaff = staffList.filter((s) => s.role === "staff" && s.is_active).length;

  const list = (requests ?? []) as TimeOffRequest[];

  // 申請日に組まれているシフトを取得（同日の人員カバー確認用）
  const reqDates = [...new Set(list.map((r) => r.off_date))];
  const { data: shiftsRaw } = reqDates.length
    ? await supabase
        .from("shifts")
        .select("staff_id, work_date, start_time, end_time")
        .in("work_date", reqDates)
    : { data: [] };
  // 日付ごとに、誰が何時に入っているか（開始時刻順）
  type DayShift = { staff_id: string; range: string; start: string };
  const shiftsByDate = new Map<string, DayShift[]>();
  for (const s of (shiftsRaw ?? []) as Pick<Shift, "staff_id" | "work_date" | "start_time" | "end_time">[]) {
    const arr = shiftsByDate.get(s.work_date) ?? [];
    arr.push({
      staff_id: s.staff_id,
      start: s.start_time,
      range: `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`,
    });
    shiftsByDate.set(s.work_date, arr);
  }
  // 申請者本人を除いた、同日の他スタッフのシフト
  const otherShiftsOf = (r: TimeOffRequest): DayShift[] =>
    (shiftsByDate.get(r.off_date) ?? [])
      .filter((s) => s.staff_id !== r.staff_id)
      .sort((a, b) => a.start.localeCompare(b.start));
  const pending = list.filter((r) => r.status === "pending").length;

  const { gaps, hasRequirements } = findCoverageGaps(
    list,
    (requirements as ShiftRequirement[] | null) ?? [],
    activeStaff
  );

  const colorOf = (id: string) => staffMap.get(id)?.display_color ?? "var(--ink-3)";

  return (
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Owner Console</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>
            Requests
          </h1>
          <p className="sub">休み希望の管理</p>
        </div>
        <Link href="/admin/shifts" className="btn-outline">
          シフト作成へ <span className="arrow">→</span>
        </Link>
      </div>

      {/* お休みの穴アラート（オーナー用） */}
      <div className="section">
        <div className="section-head">
          <h2>人員カバー分析</h2>
          <span className="eyebrow">Coverage Alert</span>
        </div>
        <div className="section-body" style={{ paddingTop: 8 }}>
          {!hasRequirements ? (
            <div className="alert-banner ok">
              <span className="ab-icon">ⓘ</span>
              <div>
                <p className="ab-title">必要人数が未設定です</p>
                <p className="help" style={{ margin: 0 }}>
                  シフト作成画面で曜日ごとの必要人数を登録すると、承認済みのお休みで人員が不足する日を自動で警告します。
                </p>
              </div>
            </div>
          ) : gaps.length === 0 ? (
            <div className="alert-banner ok">
              <span className="ab-icon">✓</span>
              <div>
                <p className="ab-title" style={{ marginBottom: 0 }}>
                  人員不足の日はありません
                </p>
              </div>
            </div>
          ) : (
            <div className="alert-banner">
              <span className="ab-icon">⚠</span>
              <div style={{ flex: 1 }}>
                <p className="ab-title">
                  承認済みのお休みで人員が不足する日が {gaps.length} 件あります
                </p>
                <div className="gap-list">
                  {gaps.map((g) => {
                    const [, m, d] = g.date.split("-");
                    return (
                      <div className="gap-row" key={g.date}>
                        <span className="gr-date">
                          {Number(m)}/{Number(d)}（{DAY_LABELS_JA[g.weekday]}）
                        </span>
                        <span className="gr-slot">
                          出勤可能 {g.available}名 ／ 必要 {g.required}名
                        </span>
                        <span className="gr-need">{g.required - g.available}名 不足</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 一覧 */}
      <div className="section">
        <div className="section-head">
          <h2>
            未対応{" "}
            <span
              className="en"
              style={{ color: pending ? "var(--accent-ink)" : "var(--ink-3)", marginLeft: 4 }}
            >
              {pending}
            </span>
            <span className="muted" style={{ fontWeight: 400 }}> 件 ／ 全 </span>
            <span className="en" style={{ fontWeight: 400 }}>
              {list.length}
            </span>
            <span className="muted" style={{ fontWeight: 400 }}> 件</span>
          </h2>
          <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <CleanupShiftsButton />
            <span className="eyebrow">Time-off</span>
          </span>
        </div>
        <div className="section-body" style={{ paddingTop: 8 }}>
          {list.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>
              休み希望はまだありません。
            </p>
          ) : (
            <>
              <table className="staff-table req-table">
                <thead>
                  <tr>
                    <th>スタッフ</th>
                    <th>日付</th>
                    <th>区分</th>
                    <th>時間</th>
                    <th>当日の出勤者</th>
                    <th>理由</th>
                    <th>状態</th>
                    <th style={{ textAlign: "right" }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const t = typeLabel(r);
                    const [, m, d] = r.off_date.split("-");
                    return (
                      <tr key={r.id}>
                        <td>
                          <span className="staff-name">
                            <span className="dot" style={{ background: colorOf(r.staff_id) }} />
                            {staffMap.get(r.staff_id)?.full_name ?? "?"}
                          </span>
                        </td>
                        <td className="mono soft">
                          {Number(m)}/{Number(d)}（{DAY_LABELS_JA[weekdayOf(r.off_date)]}）
                        </td>
                        <td>
                          <span className={`mk ${t.cls}`} style={{ fontSize: 10.5 }}>
                            {t.label}
                          </span>
                        </td>
                        <td className="mono soft">{fmtRange(r)}</td>
                        <td>
                          {otherShiftsOf(r).length === 0 ? (
                            <span className="muted">他に出勤者なし</span>
                          ) : (
                            <div className="cover-shifts">
                              {otherShiftsOf(r).map((s, i) => (
                                <span className="cover-chip" key={i}>
                                  <span className="dot" style={{ background: colorOf(s.staff_id) }} />
                                  <span className="cs-name">{staffMap.get(s.staff_id)?.full_name ?? "?"}</span>
                                  <span className="cs-time mono">{s.range}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="soft">{r.reason || "—"}</td>
                        <td>
                          <StatusPill status={r.status} />
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <RequestActions id={r.id} status={r.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* mobile cards */}
              <div className="staff-cards">
                {list.map((r) => {
                  const t = typeLabel(r);
                  const [, m, d] = r.off_date.split("-");
                  return (
                    <div className="staff-card" key={r.id}>
                      <div className="top">
                        <span className="staff-name">
                          <span className="dot" style={{ background: colorOf(r.staff_id) }} />
                          {staffMap.get(r.staff_id)?.full_name ?? "?"}
                        </span>
                        <StatusPill status={r.status} />
                      </div>
                      <div className="rows">
                        <div className="r">
                          <span className="k">日付</span>
                          <span className="v mono">
                            {Number(m)}/{Number(d)}（{DAY_LABELS_JA[weekdayOf(r.off_date)]}）
                          </span>
                        </div>
                        <div className="r">
                          <span className="k">区分</span>
                          <span className="v">
                            <span className={`mk ${t.cls}`} style={{ fontSize: 10.5 }}>
                              {t.label}
                            </span>
                          </span>
                        </div>
                        <div className="r">
                          <span className="k">時間</span>
                          <span className="v mono">{fmtRange(r)}</span>
                        </div>
                        <div className="r">
                          <span className="k">当日の出勤者</span>
                          <span className="v">
                            {otherShiftsOf(r).length === 0 ? (
                              <span className="muted">他に出勤者なし</span>
                            ) : (
                              <span className="cover-shifts">
                                {otherShiftsOf(r).map((s, i) => (
                                  <span className="cover-chip" key={i}>
                                    <span className="dot" style={{ background: colorOf(s.staff_id) }} />
                                    <span className="cs-name">{staffMap.get(s.staff_id)?.full_name ?? "?"}</span>
                                    <span className="cs-time mono">{s.range}</span>
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="r">
                          <span className="k">理由</span>
                          <span className="v">{r.reason || "—"}</span>
                        </div>
                      </div>
                      <div style={{ marginTop: 14, display: "flex", gap: 18 }}>
                        <RequestActions id={r.id} status={r.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
