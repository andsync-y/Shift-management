// シフト生成エンジンの入出力型

import type {
  AvailabilityPreference,
  FixedShift,
  Profile,
  ShiftRequirement,
  TimeOffRequest,
} from "@/lib/types";

export interface GenerateInput {
  year: number;
  month: number; // 1-12
  staff: Profile[];
  availability: AvailabilityPreference[];
  requirements: ShiftRequirement[];
  // 承認済みのお休み希望のみを渡す想定
  timeOff: TimeOffRequest[];
  // 固定シフト（毎週決まった曜日・時間）。生成前に最優先で配置する。
  fixedShifts?: FixedShift[];
}

export interface GeneratedAssignment {
  staff_id: string;
  work_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string;
  note: string | null;
}

export interface GeneratedSlotReport {
  work_date: string;
  start_time: string;
  end_time: string;
  required: number;
  filled: number;
  assigned_staff_ids: string[];
}

export interface GenerateResult {
  assignments: GeneratedAssignment[];
  // 充足できなかった枠（人手不足）の一覧
  shortages: GeneratedSlotReport[];
  // 集計：スタッフごとの合計【実働】時間（休憩控除後・給与と同じ数え方）
  staffHours: Record<string, number>;
  // 同じく合計【拘束】時間（出勤〜退勤・休憩控除前）
  staffClockedHours: Record<string, number>;
  // 1日の所定勤務時間に合わせて短縮したシフトの説明（人が読む用）
  trimmed: string[];
  warnings: string[];
}
