// =====================================================================
// 制約ベースのシフト自動生成ソルバー（ヒューリスティック貪欲法）
// =====================================================================
// 設計方針:
//  - 月内の各日付について、その曜日に紐づく「必要人数(shift_requirements)」を満たすよう
//    スタッフを割り当てる。
//  - ハード制約: 希望シフトで unavailable / 承認済みお休み希望 / 週上限時間超過 は割り当てない。
//  - ソフト制約(スコア): preferred を優先、最低希望時間に満たないスタッフを優先、
//    全体の労働時間が偏らないよう既割当時間が少ない人を優先。
// =====================================================================

import type {
  GenerateInput,
  GenerateResult,
  GeneratedAssignment,
  GeneratedSlotReport,
} from "./types";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function durationHours(start: string, end: string): number {
  return (toMinutes(end) - toMinutes(start)) / 60;
}

// [aStart,aEnd) が [bStart,bEnd) を完全に包含するか
function covers(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) <= toMinutes(bStart) && toMinutes(aEnd) >= toMinutes(bEnd);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// 指定年月の全日付を返す
function datesInMonth(year: number, month: number): { date: string; dow: number }[] {
  const result: { date: string; dow: number }[] = [];
  const last = new Date(year, month, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const dt = new Date(year, month - 1, d);
    result.push({
      date: `${year}-${pad(month)}-${pad(d)}`,
      dow: dt.getDay(),
    });
  }
  return result;
}

export function generateShifts(input: GenerateInput): GenerateResult {
  const { year, month, staff, availability, requirements, timeOff } = input;

  const activeStaff = staff.filter((s) => s.is_active);
  const warnings: string[] = [];
  const assignments: GeneratedAssignment[] = [];
  const shortages: GeneratedSlotReport[] = [];

  // スタッフごとの累計労働時間（週単位の上限判定にも使う）
  const totalHours: Record<string, number> = {};
  // 週(ISO週番号ざっくり: 月内の週インデックス)ごとの労働時間
  const weeklyHours: Record<string, Record<number, number>> = {};
  // 同一日に既に割り当て済みの時間帯（重複勤務防止）
  const dayAssignments: Record<string, Record<string, { start: string; end: string }[]>> = {};

  for (const s of activeStaff) {
    totalHours[s.id] = 0;
    weeklyHours[s.id] = {};
    dayAssignments[s.id] = {};
  }

  // 承認済みお休みを (staff_id, date) で索引化
  const offIndex = new Map<string, { start: string | null; end: string | null }[]>();
  for (const off of timeOff) {
    const key = `${off.staff_id}|${off.off_date}`;
    if (!offIndex.has(key)) offIndex.set(key, []);
    offIndex.get(key)!.push({ start: off.start_time, end: off.end_time });
  }

  const days = datesInMonth(year, month);

  for (const { date, dow } of days) {
    const weekIndex = Math.floor((Number(date.slice(-2)) - 1) / 7);
    const dayReqs = requirements.filter((r) => r.day_of_week === dow);

    for (const req of dayReqs) {
      const assignedIds: string[] = [];

      // 候補抽出
      const candidates = activeStaff.filter((s) => {
        // お休み希望チェック
        const offs = offIndex.get(`${s.id}|${date}`);
        if (offs) {
          for (const o of offs) {
            // 終日休み、または時間帯が重なる
            if (o.start === null || o.end === null) return false;
            if (overlaps(o.start, o.end, req.start_time, req.end_time)) return false;
          }
        }

        // 希望シフト(availability)チェック: その曜日に該当時間を含む枠があるか
        const prefs = availability.filter(
          (a) => a.staff_id === s.id && a.day_of_week === dow
        );
        const unavailable = prefs.some(
          (a) =>
            a.preference === "unavailable" &&
            overlaps(a.start_time, a.end_time, req.start_time, req.end_time)
        );
        if (unavailable) return false;

        const canWork = prefs.some(
          (a) =>
            a.preference !== "unavailable" &&
            covers(a.start_time, a.end_time, req.start_time, req.end_time)
        );
        // 希望シフト未登録のスタッフは候補から除外（誤割当防止）
        if (!canWork) return false;

        // 既に同日同時間帯に割当済みでないか
        const existing = dayAssignments[s.id][date] ?? [];
        if (existing.some((e) => overlaps(e.start, e.end, req.start_time, req.end_time))) {
          return false;
        }

        // 週上限時間チェック
        const slotHours = durationHours(req.start_time, req.end_time);
        const wk = weeklyHours[s.id][weekIndex] ?? 0;
        if (wk + slotHours > s.max_hours_per_week) return false;

        return true;
      });

      // スコアリング: 小さいほど優先
      const slotHours = durationHours(req.start_time, req.end_time);
      const scored = candidates
        .map((s) => {
          const prefs = availability.filter(
            (a) => a.staff_id === s.id && a.day_of_week === dow
          );
          const isPreferred = prefs.some(
            (a) =>
              a.preference === "preferred" &&
              covers(a.start_time, a.end_time, req.start_time, req.end_time)
          );
          const wk = weeklyHours[s.id][weekIndex] ?? 0;
          // 最低希望時間に未達なら強く優先
          const belowMin = wk < s.min_hours_per_week / 4; // 月内の週按分
          let score = totalHours[s.id]; // 公平性: 既割当が少ない人を優先
          if (isPreferred) score -= 1000;
          if (belowMin) score -= 500;
          return { staff: s, score };
        })
        .sort((a, b) => a.score - b.score);

      for (const { staff: s } of scored) {
        if (assignedIds.length >= req.required_staff) break;
        assignments.push({
          staff_id: s.id,
          work_date: date,
          start_time: req.start_time,
          end_time: req.end_time,
          note: null,
        });
        assignedIds.push(s.id);
        totalHours[s.id] += slotHours;
        weeklyHours[s.id][weekIndex] = (weeklyHours[s.id][weekIndex] ?? 0) + slotHours;
        if (!dayAssignments[s.id][date]) dayAssignments[s.id][date] = [];
        dayAssignments[s.id][date].push({ start: req.start_time, end: req.end_time });
      }

      if (assignedIds.length < req.required_staff) {
        shortages.push({
          work_date: date,
          start_time: req.start_time,
          end_time: req.end_time,
          required: req.required_staff,
          filled: assignedIds.length,
          assigned_staff_ids: assignedIds,
        });
      }
    }
  }

  if (shortages.length > 0) {
    warnings.push(
      `${shortages.length} 件の時間帯で必要人数を満たせませんでした。希望シフトの追加や必要人数の見直しを検討してください。`
    );
  }
  if (requirements.length === 0) {
    warnings.push(
      "必要人数(shift_requirements)が未設定です。曜日ごとの必要人数を登録してください。"
    );
  }

  return { assignments, shortages, staffHours: totalHours, warnings };
}
