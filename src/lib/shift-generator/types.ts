// シフト生成エンジンの入出力型

import type {
  AvailabilityPreference,
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
  // 集計（スタッフごとの合計労働時間など）
  staffHours: Record<string, number>;
  warnings: string[];
}
