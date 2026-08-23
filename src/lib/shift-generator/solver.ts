// =====================================================================
// 制約ベースのシフト自動生成ソルバー（ヒューリスティック貪欲法）
// =====================================================================
// 設計方針:
//  - 固定シフト(fixed_shifts)を最優先で先に配置してから、残りの必要人数を埋める。
//  - 月内の各日付について、その曜日に紐づく「必要人数(shift_requirements)」を満たすよう
//    スタッフを割り当てる。
//  - ハード制約: 希望シフトで unavailable / 承認済みお休み希望 / 週上限時間超過 は割り当てない。
//  - 社保制約:
//    * 社保加入者(shaho_enrolled)は週30時間以上になるよう強く優先（未達なら最優先で埋める）。
//    * 非加入者は週30時間未満に抑える（意図せず社保加入義務が発生しないようハード上限）。
//  - ソフト制約(スコア): preferred を優先、最低希望時間に満たないスタッフを優先、
//    全体の労働時間が偏らないよう既割当時間が少ない人を優先。
//
// 時間の数え方（重要）:
//  労働時間はすべて【実働】（休憩の自動控除後）で数える。給与計算も実働なので、
//  シフトの合計時間と給与明細の実働時間がそのまま突き合わせられる。
//  社保の週30時間も所定「労働」時間なので実働で判定する。
//
// 1日の所定勤務時間（standard_shift_hours）:
//  正社員のように1日の勤務時間が決まっている人は、必要人数の枠や固定シフトが
//  それより長くてもその長さに縮めて割り当てる（例 8.5h勤務＝実働7.5h）。
//  縮めた分は枠の反対側（早番なら夕方）が空くが、そこは重なっている遅番が
//  カバーする前提。どの枠を縮めたかは warnings に出して見えるようにする。
// =====================================================================

// 社会保険の加入ライン（週30時間・実働）。非加入者はこの手前で頭打ちにする。
const SHAHO_WEEKLY_HOURS = 30;

import type {
  GenerateInput,
  GenerateResult,
  GeneratedAssignment,
  GeneratedSlotReport,
} from "./types";
import {
  capShiftLength,
  mondayKey,
  netHours,
  toMinutes,
  weeklyAverageFromMonthly,
} from "@/lib/work-hours";

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

function mmdd(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
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

// 1件の割当。start/end は実際に居る時間、cover* は「どの枠を埋めたか」の
// 名目の時間帯（所定勤務時間で縮めた場合に元の枠を保持する）。
interface Placed {
  start: string;
  end: string;
  coverStart: string;
  coverEnd: string;
}

export function generateShifts(input: GenerateInput): GenerateResult {
  const { year, month, staff, availability, requirements, timeOff, fixedShifts } = input;

  const activeStaff = staff.filter((s) => s.is_active);
  const warnings: string[] = [];
  const assignments: GeneratedAssignment[] = [];
  const shortages: GeneratedSlotReport[] = [];

  const byId = new Map(activeStaff.map((s) => [s.id, s]));
  const isEnrolled = (id: string) => byId.get(id)?.shaho_enrolled === true;
  const capOf = (id: string) => byId.get(id)?.standard_shift_hours ?? null;
  // その人がこの枠に入ったときの実働時間（所定勤務時間で縮まる分を加味）。
  const netHoursForStaff = (staffId: string, start: string, end: string) => {
    const block = capShiftLength(start, end, capOf(staffId));
    return netHours(block.start, block.end);
  };

  // スタッフごとの累計【実働】時間（週単位の上限判定にも使う）
  const totalHours: Record<string, number> = {};
  // 拘束（休憩控除前）の累計。画面での内訳表示・確認用。
  const clockedTotals: Record<string, number> = {};
  // 週(暦の月〜日)ごとの実働時間。キーはその週の月曜日。
  // ※ 月をまたぐ週は当月分しか数えられない（前月の勤務は入力に無いため）。
  const weeklyHours: Record<string, Record<string, number>> = {};
  // 同一日に既に割り当て済みの時間帯（重複勤務防止）
  const dayAssignments: Record<string, Record<string, Placed[]>> = {};
  // 所定勤務時間で縮めた枠（説明用）
  const trimmed: string[] = [];

  for (const s of activeStaff) {
    totalHours[s.id] = 0;
    clockedTotals[s.id] = 0;
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

  // 割当を1件確定させる共通処理。
  // 所定勤務時間（standard_shift_hours）がある人は、その長さに縮めてから確定する。
  const commit = (staffId: string, date: string, start: string, end: string, note: string | null) => {
    const cap = capOf(staffId);
    const block = capShiftLength(start, end, cap);
    if (block.start !== start || block.end !== end) {
      trimmed.push(
        `${mmdd(date)} ${byId.get(staffId)?.full_name ?? ""} ${start}–${end} → ${block.start}–${block.end}（1日${cap}h勤務のため）`
      );
    }
    const week = mondayKey(date);
    const net = netHours(block.start, block.end);
    assignments.push({
      staff_id: staffId,
      work_date: date,
      start_time: block.start,
      end_time: block.end,
      note,
    });
    totalHours[staffId] += net;
    clockedTotals[staffId] += (toMinutes(block.end) - toMinutes(block.start)) / 60;
    weeklyHours[staffId][week] = (weeklyHours[staffId][week] ?? 0) + net;
    if (!dayAssignments[staffId][date]) dayAssignments[staffId][date] = [];
    // 縮めても「その枠を埋めた」ことは元の時間帯で覚えておく。
    dayAssignments[staffId][date].push({ ...block, coverStart: start, coverEnd: end });
  };

  // --- ① 固定シフトを最優先で先に配置する ---
  // 承認済みお休みと重なる固定シフトはスキップ（休み優先）。
  // 週の上限時間（max_hours_per_week）はここでも守る。以前は固定シフトだけ
  // 無条件に置いていたため、固定シフトを入れすぎると本人の上限を超えたまま
  // 総労働時間だけが膨らんでいた（外した件数は警告に出す）。
  const droppedFixed: string[] = [];
  for (const { date, dow } of days) {
    for (const f of fixedShifts ?? []) {
      const s = byId.get(f.staff_id);
      if (f.day_of_week !== dow || !s) continue;
      const offs = offIndex.get(`${f.staff_id}|${date}`);
      const onLeave = offs?.some(
        (o) => o.start === null || o.end === null || overlaps(o.start, o.end, f.start_time, f.end_time)
      );
      if (onLeave) continue;
      const existing = dayAssignments[f.staff_id][date] ?? [];
      if (existing.some((e) => overlaps(e.coverStart, e.coverEnd, f.start_time, f.end_time))) continue;

      const start = f.start_time.slice(0, 5);
      const end = f.end_time.slice(0, 5);
      const wk = weeklyHours[f.staff_id][mondayKey(date)] ?? 0;
      if (wk + netHoursForStaff(f.staff_id, start, end) > s.max_hours_per_week) {
        droppedFixed.push(`${mmdd(date)} ${s.full_name} ${start}–${end}`);
        continue;
      }
      commit(f.staff_id, date, start, end, f.shift_type ?? "固定");
    }
  }
  if (droppedFixed.length > 0) {
    const names = [...new Set(droppedFixed.map((t) => t.split(" ")[1]))].join("、");
    warnings.push(
      `週の上限時間を超えるため固定シフトを ${droppedFixed.length} 件外しました（${names}）。上限を上げるか固定シフトを減らしてください。`
    );
  }

  // --- ② 必要人数を埋める（固定シフトで既に埋まった分は差し引く）---
  for (const { date, dow } of days) {
    const week = mondayKey(date);
    const dayReqs = requirements.filter((r) => r.day_of_week === dow);

    for (const req of dayReqs) {
      // 固定シフトで既にこの枠を（時間帯を包含する形で）カバーしている人を数える
      const preFilled = activeStaff.filter((s) =>
        (dayAssignments[s.id][date] ?? []).some((e) =>
          covers(e.coverStart, e.coverEnd, req.start_time, req.end_time)
        )
      );
      const assignedIds: string[] = preFilled.map((s) => s.id);

      // 候補抽出
      const candidates = activeStaff.filter((s) => {
        if (assignedIds.includes(s.id)) return false; // 固定シフトで既に充当済み
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
        if (existing.some((e) => overlaps(e.coverStart, e.coverEnd, req.start_time, req.end_time))) {
          return false;
        }

        // 週上限時間チェック（実働・所定勤務時間で縮まる分も加味）
        const slotHours = netHoursForStaff(s.id, req.start_time, req.end_time);
        const wk = weeklyHours[s.id][week] ?? 0;
        if (wk + slotHours > s.max_hours_per_week) return false;

        // 社保・非加入者は週30時間未満に抑える（意図しない社保加入義務を防ぐ）。
        // 固定シフトで既に30h以上ある場合はそれを尊重して新規追加のみ止める。
        if (!isEnrolled(s.id) && wk + slotHours > SHAHO_WEEKLY_HOURS) return false;

        return true;
      });

      // スコアリング: 小さいほど優先
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
          const slotHours = netHoursForStaff(s.id, req.start_time, req.end_time);
          const wk = weeklyHours[s.id][week] ?? 0;
          // 最低希望時間に未達なら強く優先
          const belowMin = wk < s.min_hours_per_week / 4; // 月内の週按分
          // 社保加入者がまだ週30時間に未達なら最優先で埋める（加入要件の確保）
          const enrolledBelow30 = isEnrolled(s.id) && wk + slotHours <= s.max_hours_per_week && wk < SHAHO_WEEKLY_HOURS;
          let score = totalHours[s.id]; // 公平性: 既割当が少ない人を優先
          if (isPreferred) score -= 1000;
          if (belowMin) score -= 500;
          if (enrolledBelow30) score -= 2000; // 社保確保を最優先
          return { staff: s, score };
        })
        .sort((a, b) => a.score - b.score);

      for (const { staff: s } of scored) {
        if (assignedIds.length >= req.required_staff) break;
        commit(s.id, date, req.start_time, req.end_time, null);
        assignedIds.push(s.id);
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
  if (trimmed.length > 0) {
    warnings.push(
      `1日の所定勤務時間に合わせて ${trimmed.length} 件のシフトを短縮しました（例: ${trimmed[0]}）。空いた時間帯は重なる早番/遅番でカバーされる想定です。`
    );
  }

  // 社保の週時間チェック（週平均の実働で判定＝社保は所定の週労働時間で見るため）。
  // 週平均は「月 × 12 ÷ 52」で出す（実務の通例）。以前は月内の週バケット数で
  // 割っており、月末の半端な週の分だけ平均が低く出て判定が甘くなっていた。
  //  - 加入者: 週平均30時間に届かなければ警告（加入要件の未達）。
  //  - 非加入者: 週平均30時間を超えれば警告（意図しない社保加入義務のリスク・固定シフト由来も検知）。
  for (const s of activeStaff) {
    const avgWeekly = weeklyAverageFromMonthly(totalHours[s.id]);
    if (s.shaho_enrolled) {
      if (avgWeekly < SHAHO_WEEKLY_HOURS) {
        warnings.push(
          `社保加入の ${s.full_name} が週平均${avgWeekly.toFixed(1)}h（実働）で30hに未達です。希望シフト・必要人数を増やして労働時間を確保してください。`
        );
      }
    } else if (avgWeekly > SHAHO_WEEKLY_HOURS) {
      warnings.push(
        `⚠️ 非加入の ${s.full_name} が週平均${avgWeekly.toFixed(1)}h（実働）で30hを超えています（社保加入義務が発生する恐れ）。固定シフトを減らすか社保加入をご検討ください。`
      );
    }
  }

  return {
    assignments,
    shortages,
    staffHours: totalHours,
    staffClockedHours: clockedTotals,
    trimmed,
    warnings,
  };
}
