import type { TimeOffRequest } from "@/lib/types";

// staff_blackouts（個別予定の不可時間）を、シフト生成ソルバーが解釈できる
// TimeOffRequest 形に変換する。solver は (staff_id, 日付, 時間帯重なり) だけ見て
// 不可判定するため、start/end を持たせれば部分不可・null なら終日不可になる。
export function blackoutsToTimeOff(
  rows: { staff_id: string; blackout_date: string; start_time: string | null; end_time: string | null }[]
): TimeOffRequest[] {
  return rows.map((b, i) => ({
    id: `blackout-${i}`,
    staff_id: b.staff_id,
    period_id: null,
    off_date: b.blackout_date,
    start_time: b.start_time,
    end_time: b.end_time,
    reason: "個別予定",
    request_type: "off",
    status: "approved",
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date().toISOString(),
  })) as TimeOffRequest[];
}

// 月(year, month)の日付範囲 [first, last] を "YYYY-MM-DD" で返す。
export function monthRange(year: number, month: number): { first: string; last: string } {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return { first: `${year}-${mm}-01`, last: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}
