// =====================================================================
// シフト自動生成ソルバーのテスト
// =====================================================================
// 特に「時間の数え方が実働であること」と「1日の所定勤務時間で
// シフトが縮むこと」を固定する。ここがズレると、シフトの合計時間と
// 給与の実働時間が食い違う。
// =====================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateShifts } from "@/lib/shift-generator/solver";
import type { GenerateInput } from "@/lib/shift-generator/types";
import type { AvailabilityPreference, FixedShift, Profile, ShiftRequirement } from "@/lib/types";

const EARLY = { start: "09:30", end: "19:00" };
const LATE = { start: "12:30", end: "22:00" };

function staffOf(over: Partial<Profile> & { id: string; full_name: string }): Profile {
  return {
    role: "staff",
    employment_type: "part_time",
    phone: null,
    hourly_wage: 1600,
    min_hours_per_week: 0,
    max_hours_per_week: 40,
    display_color: "#000",
    skills: [],
    is_active: true,
    initial_password: null,
    calendar_token: null,
    line_user_id: null,
    created_at: "",
    updated_at: "",
    ...over,
  } as Profile;
}

// 指定曜日（既定は全曜日）に必要人数を置く
function reqs(
  slots: { start: string; end: string; n: number }[],
  dows: number[] = [0, 1, 2, 3, 4, 5, 6]
): ShiftRequirement[] {
  const rows: ShiftRequirement[] = [];
  for (const dow of dows) {
    for (const s of slots) {
      rows.push({
        id: `${dow}-${s.start}`,
        period_id: "p",
        day_of_week: dow,
        start_time: s.start,
        end_time: s.end,
        required_staff: s.n,
        created_at: "",
      } as ShiftRequirement);
    }
  }
  return rows;
}

// 全曜日・全時間帯OKの希望シフト
function alwaysAvailable(staffId: string): AvailabilityPreference[] {
  return Array.from({ length: 7 }, (_, dow) => ({
    id: `${staffId}-${dow}`,
    staff_id: staffId,
    day_of_week: dow,
    start_time: "09:00",
    end_time: "22:00",
    preference: "available" as const,
    created_at: "",
  }));
}

function baseInput(over: Partial<GenerateInput> = {}): GenerateInput {
  return {
    year: 2026,
    month: 9,
    staff: [],
    availability: [],
    requirements: [],
    timeOff: [],
    fixedShifts: [],
    ...over,
  };
}

// 週30時間の頭打ちに引っかからない人（社保加入・週上限を高く）。
// トリムや実働換算そのものを見たいテストではこちらを使う。
function unconstrained(over: Partial<Profile> & { id: string; full_name: string }): Profile {
  return staffOf({ shaho_enrolled: true, max_hours_per_week: 70, ...over });
}

describe("時間の集計は実働（休憩控除後）", () => {
  test("早番9.5hの枠に1人入ると実働8.5hで数える", () => {
    const a = unconstrained({ id: "a", full_name: "Aさん" });
    const r = generateShifts(
      baseInput({
        staff: [a],
        availability: alwaysAvailable("a"),
        requirements: reqs([{ ...EARLY, n: 1 }]),
      })
    );
    const days = r.assignments.length;
    assert.equal(days, 30, "9月は30日");
    assert.equal(r.staffHours["a"], 8.5 * 30, "実働＝拘束9.5h−休憩1h");
    assert.equal(r.staffClockedHours["a"], 9.5 * 30);
  });
});

describe("1日の所定勤務時間（standard_shift_hours）", () => {
  test("早番の枠は開始そのまま・終了を早めて8.5h勤務にする", () => {
    const aina = unconstrained({ id: "aina", full_name: "あいな", standard_shift_hours: 8.5 });
    const r = generateShifts(
      baseInput({
        staff: [aina],
        availability: alwaysAvailable("aina"),
        requirements: reqs([{ ...EARLY, n: 1 }]),
      })
    );
    const first = r.assignments[0];
    assert.equal(first.start_time, "09:30");
    assert.equal(first.end_time, "18:00");
    assert.equal(r.staffHours["aina"], 7.5 * 30, "実働7.5h × 30日");
    assert.ok(r.trimmed.length > 0, "短縮した旨が記録される");
  });

  test("遅番の枠は終了そのまま・開始を遅らせる（閉店を空けない）", () => {
    const aina = unconstrained({ id: "aina", full_name: "あいな", standard_shift_hours: 8.5 });
    const r = generateShifts(
      baseInput({
        staff: [aina],
        availability: alwaysAvailable("aina"),
        requirements: reqs([{ ...LATE, n: 1 }]),
      })
    );
    assert.equal(r.assignments[0].start_time, "13:30");
    assert.equal(r.assignments[0].end_time, "22:00");
  });

  test("固定シフトも所定の長さに縮む", () => {
    const aina = staffOf({ id: "aina", full_name: "あいな", standard_shift_hours: 8.5 });
    const fixed: FixedShift[] = [
      { id: "f1", staff_id: "aina", day_of_week: 1, start_time: "09:30", end_time: "19:00", shift_type: "早番", created_at: "" },
    ];
    const r = generateShifts(baseInput({ staff: [aina], fixedShifts: fixed }));
    assert.ok(r.assignments.length > 0);
    for (const a of r.assignments) {
      assert.equal(a.start_time, "09:30");
      assert.equal(a.end_time, "18:00");
    }
  });

  test("所定を設定していない人は従来どおり枠の長さのまま", () => {
    const b = unconstrained({ id: "b", full_name: "Bさん" });
    const r = generateShifts(
      baseInput({
        staff: [b],
        availability: alwaysAvailable("b"),
        requirements: reqs([{ ...EARLY, n: 1 }]),
      })
    );
    assert.equal(r.assignments[0].end_time, "19:00");
    assert.equal(r.trimmed.length, 0);
  });

  test("縮めても『その枠を埋めた』扱いになり、他の人が重ねて入らない", () => {
    const aina = unconstrained({ id: "aina", full_name: "あいな", standard_shift_hours: 8.5 });
    const b = unconstrained({ id: "b", full_name: "Bさん" });
    const fixed: FixedShift[] = [
      { id: "f1", staff_id: "aina", day_of_week: 1, start_time: "09:30", end_time: "19:00", shift_type: "早番", created_at: "" },
    ];
    const r = generateShifts(
      baseInput({
        staff: [aina, b],
        availability: alwaysAvailable("b"),
        requirements: reqs([{ ...EARLY, n: 1 }], [1]), // 月曜の早番のみ
        fixedShifts: fixed,
      })
    );
    // 09:30–18:00 は 09:30–19:00 の枠を包含しないが、「その枠を埋めた」と数える。
    assert.ok(r.assignments.every((a) => a.staff_id === "aina"), "Bさんは重ねて入らない");
    assert.equal(r.shortages.length, 0, "人手不足は発生しない");
  });
});

describe("社会保険の週30時間チェック（実働ベース）", () => {
  test("非加入者は実働で週30hを超えないよう抑えられる", () => {
    const b = staffOf({ id: "b", full_name: "Bさん", shaho_enrolled: false });
    const r = generateShifts(
      baseInput({
        staff: [b],
        availability: alwaysAvailable("b"),
        requirements: reqs([{ ...EARLY, n: 1 }]),
      })
    );
    // 実働8.5h/日 → 週30hに収まるのは3日まで（25.5h）。4日目は34hで超える。
    const perWeek: Record<number, number> = {};
    for (const a of r.assignments) {
      const wk = Math.floor((Number(a.work_date.slice(-2)) - 1) / 7);
      perWeek[wk] = (perWeek[wk] ?? 0) + 1;
    }
    for (const n of Object.values(perWeek)) {
      assert.ok(n * 8.5 <= 30, `週${n}日=${n * 8.5}hは30h以内`);
    }
  });

  test("所定8.5h勤務なら実働7.5hなので同じ週でも1日多く入れる", () => {
    const aina = staffOf({ id: "aina", full_name: "あいな", standard_shift_hours: 8.5, shaho_enrolled: false });
    const r = generateShifts(
      baseInput({
        staff: [aina],
        availability: alwaysAvailable("aina"),
        requirements: reqs([{ ...EARLY, n: 1 }]),
      })
    );
    const week0 = r.assignments.filter((a) => Number(a.work_date.slice(-2)) <= 7);
    assert.equal(week0.length, 4, "7.5h×4日=30h まで入る");
  });

  test("社保加入者が週30hに届かなければ警告が出る", () => {
    const kayo = staffOf({ id: "kayo", full_name: "かよ", shaho_enrolled: true });
    const r = generateShifts(
      baseInput({
        staff: [kayo],
        availability: alwaysAvailable("kayo"),
        requirements: reqs([{ start: "09:30", end: "15:00", n: 1 }], [1]), // 月曜だけ実働5.5h
      })
    );
    assert.ok(r.warnings.some((w) => w.includes("かよ") && w.includes("30h")));
  });
});
