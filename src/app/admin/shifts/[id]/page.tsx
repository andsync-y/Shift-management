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

  return (
    <div className="page space-y-6">
      <div className="crumbs">
        <Link href="/admin/shifts">シフト作成</Link>
        <span className="sep">/</span>
        <span>
          {p.year}年{p.month}月
        </span>
      </div>

      <div className="masthead" style={{ marginBottom: 8, display: "flex", alignItems: "baseline", gap: 14 }}>
        <div>
          <div className="eyebrow accent">Owner Console</div>
          <h1 className="ttl en">
            {p.year}.{String(p.month).padStart(2, "0")}
          </h1>
          <p className="sub">
            {p.year}年{p.month}月 のシフト
          </p>
        </div>
        <span className="tag">{PERIOD_STATUS_LABELS_JA[p.status]}</span>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">必要人数の設定</h2>
        <p className="mb-4 text-sm text-gray-500">
          曜日・時間帯ごとに必要なスタッフ数を登録します。AIシフト生成の基準になります。
        </p>
        <RequirementsEditor
          periodId={id}
          initial={(requirements ?? []) as ShiftRequirement[]}
        />
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">AIシフト生成・公開</h2>
        <GeneratePanel periodId={id} status={p.status} />
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">シフト表（{shiftList.length}件）</h2>
        </div>
        {shiftList.length > 0 ? (
          <ShiftCalendarView
            year={p.year}
            month={p.month}
            shifts={shiftList}
            staff={staffList}
            timeOff={timeOffList}
          />
        ) : (
          <p className="text-sm text-gray-400">
            まだシフトがありません。上の「AIでシフトを自動生成」を実行してください。
          </p>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">シフトの手動調整</h2>
        <p className="mb-4 text-sm text-gray-500">
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

      {p.status === "confirmed" && (
        <div className="card">
          <h2 className="mb-3 font-semibold">サロンボードへ反映</h2>
          <SalonBoardPanel periodId={id} />
        </div>
      )}

      {Object.keys(hours).length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-semibold">スタッフ別 合計勤務時間</h2>
          <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {staffList
              .filter((s) => hours[s.id])
              .map((s) => (
                <li key={s.id} className="flex items-center justify-between border-b border-gray-100 py-1">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: s.display_color }} />
                    {s.full_name}
                  </span>
                  <span className="font-medium">{hours[s.id].toFixed(1)}h</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
