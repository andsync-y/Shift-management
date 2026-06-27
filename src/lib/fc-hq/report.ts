// FC本部システム「勤務時間」「スタッフ管理」フォームへ転記するための月次データを生成する。
// 集計ロジックは勤怠管理画面（src/app/admin/timecards/page.tsx）と同じ
// （打刻 clock_in〜clock_out を合算、完了した勤務日数をカウント）。
//
// 本部フォームは本名（漢字）＋カナ氏名を要求するため、ここでは display_name（ローマ字の
// システム上の呼び名）ではなく full_name（本名）を使う。

import { createAdminClient } from "@/lib/supabase/server";
import {
  EMPLOYMENT_LABELS_JA,
  WORK_STATUS_LABELS_JA,
  type Profile,
  type TimeRecord,
} from "@/lib/types";

const STORE_NAME = process.env.STORE_NAME || "全力ストレッチ岐阜長良店";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function minutesBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
}

export interface FcHqStaffRow {
  name: string; // 本名（漢字）
  name_kana: string; // カナ氏名
  work_status: string; // active / on_leave / retired
  work_status_label: string; // 在籍中 / 休職中 / 退職
  employment_type_label: string; // 正社員 / アルバイト
  phone: string;
  monthly_hours: number; // 勤務時間（小数1桁）
  worked_days: number; // 勤務日数（完了した勤務日の数）
  late_absence: string; // 遅刻欠勤（自動判定不可のため既定「無」）
  note: string;
}

export interface FcHqReport {
  month: string; // "YYYY-MM"
  store: string;
  staff: FcHqStaffRow[];
}

// 指定月（YYYY-MM）のFC本部転記用データを組み立てる。
export async function buildFcHqReport(month: string): Promise<FcHqReport> {
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${pad(m)}-01`;
  const end = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;

  const admin = createAdminClient();
  const [{ data: recRaw }, { data: profRaw }] = await Promise.all([
    admin
      .from("time_records")
      .select("staff_id, clock_in, clock_out, work_date")
      .gte("work_date", start)
      .lte("work_date", end),
    admin.from("profiles").select("*").eq("role", "staff").order("full_name"),
  ]);

  const staff = (profRaw as Profile[] | null) ?? [];
  const records = (recRaw as Pick<TimeRecord, "staff_id" | "clock_in" | "clock_out" | "work_date">[] | null) ?? [];

  // スタッフ別に勤務分数の合計と勤務日（完了した日）を集計
  const minutesByStaff = new Map<string, number>();
  const daysByStaff = new Map<string, Set<string>>();
  for (const r of records) {
    if (!r.clock_in || !r.clock_out) continue; // 退勤まで完了した記録のみ
    minutesByStaff.set(r.staff_id, (minutesByStaff.get(r.staff_id) ?? 0) + minutesBetween(r.clock_in, r.clock_out));
    const set = daysByStaff.get(r.staff_id) ?? new Set<string>();
    set.add(r.work_date);
    daysByStaff.set(r.staff_id, set);
  }

  const rows: FcHqStaffRow[] = staff.map((s) => {
    const minutes = minutesByStaff.get(s.id) ?? 0;
    const status = s.work_status ?? "active";
    return {
      name: s.full_name,
      name_kana: s.name_kana ?? "",
      work_status: status,
      work_status_label: WORK_STATUS_LABELS_JA[status] ?? "在籍中",
      employment_type_label: EMPLOYMENT_LABELS_JA[s.employment_type],
      phone: s.phone ?? "",
      monthly_hours: Math.round((minutes / 60) * 10) / 10,
      worked_days: daysByStaff.get(s.id)?.size ?? 0,
      late_absence: "無",
      note: "",
    };
  });

  return { month, store: STORE_NAME, staff: rows };
}
