import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  PERIOD_STATUS_LABELS_JA,
  type Profile,
  type Shift,
  type ShiftPeriod,
  type ShiftRequirement,
  type StoreEvent,
  type TimeOffRequest,
} from "@/lib/types";
import { clockedHours, netHours } from "@/lib/work-hours";
import ShiftCalendarView from "@/components/ShiftCalendarView";
import RequirementsEditor from "./RequirementsEditor";
import GeneratePanel from "./GeneratePanel";
import ShiftEditor from "./ShiftEditor";
import StoreEventEditor from "./StoreEventEditor";
import SalonBoardPanel from "./SalonBoardPanel";


export default async function PeriodDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: period } = await supabase
    .from("shift_periods")
    .select("*")
    .eq("id", id)
    .single();
  if (!period) notFound();
  const p = period as ShiftPeriod;

  const monthStart = `${p.year}-${String(p.month).padStart(2, "0")}-01`;
  const monthEnd = `${p.year}-${String(p.month).padStart(2, "0")}-${String(
    new Date(p.year, p.month, 0).getDate()
  ).padStart(2, "0")}`;
  const [
    { data: requirements },
    { data: shifts },
    { data: staff },
    { data: timeOff },
    { data: storeEvents },
  ] = await Promise.all([
    supabase.from("shift_requirements").select("*").eq("period_id", id),
    supabase.from("shifts").select("*").eq("period_id", id),
    supabase.from("profiles").select("*"),
    supabase
      .from("time_off_requests")
      .select("*")
      .eq("status", "approved")
      .gte("off_date", monthStart)
      .lte("off_date", monthEnd),
    supabase
      .from("store_events")
      .select("*")
      .gte("event_date", monthStart)
      .lte("event_date", monthEnd),
  ]);

  const staffList = (staff ?? []) as Profile[];
  const shiftList = (shifts ?? []) as Shift[];
  const timeOffList = (timeOff ?? []) as TimeOffRequest[];
  const storeEventList = (storeEvents ?? []) as StoreEvent[];

  // スタッフごとの合計時間。
  // 実働（休憩控除後）を主に見せる＝給与計算と同じ数え方なので、
  // 「シフトは912h なのに給与は727h」というズレが起きない。拘束は括弧で併記。
  const hours: Record<string, number> = {};
  const clocked: Record<string, number> = {};
  const shiftDays: Record<string, number> = {};
  for (const s of shiftList) {
    hours[s.staff_id] = (hours[s.staff_id] ?? 0) + netHours(s.start_time, s.end_time);
    clocked[s.staff_id] = (clocked[s.staff_id] ?? 0) + clockedHours(s.start_time, s.end_time);
    shiftDays[s.staff_id] = (shiftDays[s.staff_id] ?? 0) + 1;
  }
  const totalNet = Object.values(hours).reduce((a, b) => a + b, 0);
  const totalClocked = Object.values(clocked).reduce((a, b) => a + b, 0);

  const published = p.status === "published";

  // 承認済みのお休み（終日／時間帯休み）と重複しているシフトを検出する。
  // 間違って承認したお休みの上にシフトが入っている状態を見つけて直せるようにする。
  const staffMap = new Map(staffList.map((s) => [s.id, s]));
  const offByStaffDate = new Map<string, TimeOffRequest[]>();
  for (const t of timeOffList) {
    if (t.status !== "approved" || t.request_type !== "off") continue;
    const k = `${t.staff_id}|${t.off_date}`;
    const arr = offByStaffDate.get(k);
    if (arr) arr.push(t);
    else offByStaffDate.set(k, [t]);
  }
  const conflicts = shiftList
    .map((s) => {
      const offs = offByStaffDate.get(`${s.staff_id}|${s.work_date}`) ?? [];
      const hit = offs.find((t) => {
        const allDay = !t.start_time || !t.end_time;
        return (
          allDay ||
          (s.start_time.slice(0, 5) < t.end_time!.slice(0, 5) &&
            t.start_time!.slice(0, 5) < s.end_time.slice(0, 5))
        );
      });
      if (!hit) return null;
      const [, m, d] = s.work_date.split("-");
      return {
        id: s.id,
        date: `${Number(m)}/${Number(d)}`,
        name: staffMap.get(s.staff_id)?.full_name ?? "?",
        color: staffMap.get(s.staff_id)?.display_color ?? "var(--ink-3)",
        shift: `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`,
        off:
          hit.start_time && hit.end_time
            ? `${hit.start_time.slice(0, 5)}–${hit.end_time.slice(0, 5)}`
            : "終日",
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="page">
      <div className="crumbs">
        <Link href="/admin/shifts">シフト作成</Link>
        <span className="sep">/</span>
        <span>
          {p.year}年{p.month}月
        </span>
      </div>

      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            Owner Console
            <span className={`tag${published ? " green" : ""}`}>
              <span
                className="dot"
                style={{ background: published ? "#3d6b4f" : "var(--ink-3)" }}
              />
              {PERIOD_STATUS_LABELS_JA[p.status]}
            </span>
          </div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>
            Schedule
          </h1>
          <p className="sub">
            シフト作成 — {p.year}年{p.month}月
          </p>
        </div>
        <span style={{ display: "flex", gap: 8 }}>
          <Link href={`/admin/shifts/${id}/print`} className="btn-outline">
            🖨 印刷
          </Link>
          <Link href="/admin/shifts" className="btn-outline">
            <span className="arrow">←</span> 一覧へ
          </Link>
        </span>
      </div>

      {/* 承認済みお休みとシフトの矛盾 警告 */}
      {conflicts.length > 0 && (
        <div className="alert-banner" style={{ marginBottom: 4 }}>
          <span className="ab-icon">⚠</span>
          <div style={{ flex: 1 }}>
            <p className="ab-title">
              承認済みのお休みと重複しているシフトが {conflicts.length} 件あります
            </p>
            <p className="help" style={{ marginTop: 0, marginBottom: 8 }}>
              間違って承認した場合は「休み希望」画面で承認を取り消せます。シフト側を直す場合は下の「シフトの手動調整」で削除・時刻変更してください。
            </p>
            <div className="gap-list">
              {conflicts.map((c) => (
                <div className="gap-row" key={c.id}>
                  <span className="gr-date">{c.date}</span>
                  <span className="gr-slot">
                    <span
                      className="dot"
                      style={{ background: c.color, display: "inline-block", marginRight: 7 }}
                    />
                    {c.name}：シフト {c.shift}
                  </span>
                  <span className="gr-need">お休み {c.off} と重複</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 必要人数の設定 */}
      <div className="section">
        <div className="section-head">
          <h2>必要人数の設定</h2>
          <span className="eyebrow">Coverage</span>
        </div>
        <div className="section-body">
          <p className="help" style={{ marginTop: 0, marginBottom: 22 }}>
            曜日・時間帯ごとに必要なスタッフ数を登録します。AIシフト生成の基準になります。
          </p>
          <RequirementsEditor periodId={id} initial={(requirements ?? []) as ShiftRequirement[]} />
        </div>
      </div>

      {/* AI生成・公開 */}
      <div className="section">
        <div className="section-head">
          <h2>AIシフト生成・公開</h2>
          <span className="eyebrow">Generate</span>
        </div>
        <div className="section-body">
          <GeneratePanel periodId={id} status={p.status} />
        </div>
      </div>

      {/* シフト表 */}
      <div className="section">
        <div className="section-head">
          <h2>
            シフト表{" "}
            <span className="muted en" style={{ fontWeight: 400, fontSize: 14, marginLeft: 6 }}>
              {shiftList.length}件
            </span>
          </h2>
          <span className="eyebrow">Calendar</span>
        </div>
        <div className="section-body">
          {shiftList.length > 0 || timeOffList.length > 0 ? (
            <>
              {shiftList.length === 0 && (
                <p className="help" style={{ marginTop: 0, marginBottom: 16 }}>
                  まだシフトはありません（承認済みのお休みのみ表示中）。上の「AIシフト生成」を実行してください。
                </p>
              )}
              <ShiftCalendarView
                year={p.year}
                month={p.month}
                shifts={shiftList}
                staff={staffList}
                timeOff={timeOffList}
                storeEvents={storeEventList}
                showHours
              />
            </>
          ) : (
            <p className="help" style={{ margin: 0 }}>
              まだシフトがありません。上の「AIでシフトを自動生成」を実行してください。
            </p>
          )}
        </div>
      </div>

      {/* 店休・お知らせ */}
      <div className="section">
        <div className="section-head">
          <h2>店休・お知らせ</h2>
          <span className="eyebrow">Store Notices</span>
        </div>
        <div className="section-body">
          <p className="help" style={{ marginTop: 0, marginBottom: 22 }}>
            店休日や講習などのお知らせを登録すると、カレンダーの該当日にバナー表示されます（スタッフ画面・キオスクにも反映）。時間や「全員参加」も指定できます。
          </p>
          <StoreEventEditor
            periodId={id}
            year={p.year}
            month={p.month}
            events={storeEventList}
          />
        </div>
      </div>

      {/* 手動調整 */}
      <div className="section">
        <div className="section-head">
          <h2>シフトの手動調整</h2>
          <span className="eyebrow">Adjust</span>
        </div>
        <div className="section-body">
          <p className="help" style={{ marginTop: 0, marginBottom: 22 }}>
            AI生成の結果を個別に追加・時刻変更・削除できます。手動で調整したシフトは再生成すると失われるため、確定前に調整してください。
          </p>
          <ShiftEditor
            periodId={id}
            year={p.year}
            month={p.month}
            shifts={shiftList}
            staff={staffList}
          />
        </div>
      </div>

      {p.status === "confirmed" && (
        <div className="section">
          <div className="section-head">
            <h2>サロンボードへ反映</h2>
            <span className="eyebrow">Salon Board</span>
          </div>
          <div className="section-body">
            <SalonBoardPanel periodId={id} />
          </div>
        </div>
      )}

      {/* 集計 */}
      {Object.keys(hours).length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>スタッフ別 合計勤務時間</h2>
            <span className="eyebrow">
              実働 {totalNet.toFixed(1)}h（拘束 {totalClocked.toFixed(1)}h）
            </span>
          </div>
          <div className="section-body">
            <div className="totals-grid">
              {staffList
                .filter((s) => hours[s.id])
                .map((s) => (
                  <div className="total-item" key={s.id}>
                    <span className="dot" style={{ background: s.display_color }} />
                    <span className="tname">{s.full_name}</span>
                    <span className="thours en">
                      {hours[s.id].toFixed(1)}
                      <small>h</small>
                      <small className="tsub">
                        {shiftDays[s.id]}日 / 拘束{clocked[s.id].toFixed(1)}h
                      </small>
                    </span>
                  </div>
                ))}
            </div>
            <p className="help" style={{ marginTop: 10 }}>
              表示は<strong>実働</strong>（休憩の自動控除後：8時間超→60分・6時間超→45分）。
              給与計算と同じ数え方なので、給与明細の実働時間とそのまま比較できます。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
