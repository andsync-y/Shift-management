import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  PERIOD_STATUS_LABELS_JA,
  type Profile,
  type Shift,
  type ShiftPeriod,
  type ShiftRequirement,
  type TimeOffRequest,
} from "@/lib/types";
import ShiftCalendarView from "@/components/ShiftCalendarView";
import RequirementsEditor from "./RequirementsEditor";
import GeneratePanel from "./GeneratePanel";
import ShiftEditor from "./ShiftEditor";
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
  const monthEnd = `${p.year}-${String(p.month).padStart(2, "0")}-31`;
  const [{ data: requirements }, { data: shifts }, { data: staff }, { data: timeOff }] =
    await Promise.all([
      supabase.from("shift_requirements").select("*").eq("period_id", id),
      supabase.from("shifts").select("*").eq("period_id", id),
      supabase.from("profiles").select("*"),
      supabase
        .from("time_off_requests")
        .select("*")
        .eq("status", "approved")
        .gte("off_date", monthStart)
        .lte("off_date", monthEnd),
    ]);

  const staffList = (staff ?? []) as Profile[];
  const shiftList = (shifts ?? []) as Shift[];
  const timeOffList = (timeOff ?? []) as TimeOffRequest[];

  // スタッフごとの合計時間
  const hours: Record<string, number> = {};
  for (const s of shiftList) {
    const dur =
      (Number(s.end_time.slice(0, 2)) * 60 + Number(s.end_time.slice(3, 5)) -
        Number(s.start_time.slice(0, 2)) * 60 - Number(s.start_time.slice(3, 5))) /
      60;
    hours[s.staff_id] = (hours[s.staff_id] ?? 0) + dur;
  }

  const published = p.status === "published";

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
        <Link href="/admin/shifts" className="btn-outline">
          <span className="arrow">←</span> 一覧へ
        </Link>
      </div>

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
          {shiftList.length > 0 ? (
            <ShiftCalendarView
              year={p.year}
              month={p.month}
              shifts={shiftList}
              staff={staffList}
              timeOff={timeOffList}
            />
          ) : (
            <p className="help" style={{ margin: 0 }}>
              まだシフトがありません。上の「AIでシフトを自動生成」を実行してください。
            </p>
          )}
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
            <span className="eyebrow">Totals</span>
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
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
