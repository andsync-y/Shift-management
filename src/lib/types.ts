// アプリ全体で使うドメイン型定義

export type UserRole = "super_admin" | "staff";
export type EmploymentType = "full_time" | "part_time";
export type AvailabilityPref = "preferred" | "available" | "unavailable";
export type PeriodStatus = "draft" | "published" | "confirmed";
export type RequestStatus = "pending" | "approved" | "rejected";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  employment_type: EmploymentType;
  phone: string | null;
  hourly_wage: number | null;
  min_hours_per_week: number;
  max_hours_per_week: number;
  display_color: string;
  skills: string[];
  is_active: boolean;
  initial_password: string | null;
  calendar_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityPreference {
  id: string;
  staff_id: string;
  day_of_week: number; // 0=日 .. 6=土
  start_time: string; // "HH:MM"
  end_time: string;
  preference: AvailabilityPref;
  created_at: string;
}

export interface FixedShift {
  id: string;
  staff_id: string;
  day_of_week: number; // 0=日 .. 6=土
  start_time: string; // "HH:MM"
  end_time: string;
  shift_type: string | null;
  created_at: string;
}

export interface ShiftPeriod {
  id: string;
  year: number;
  month: number;
  status: PeriodStatus;
  note: string | null;
  created_at: string;
  published_at: string | null;
  confirmed_at: string | null;
}

export interface ShiftRequirement {
  id: string;
  period_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  required_staff: number;
  created_at: string;
}

export interface Shift {
  id: string;
  period_id: string;
  staff_id: string;
  work_date: string; // "YYYY-MM-DD"
  start_time: string;
  end_time: string;
  note: string | null;
  ai_generated: boolean;
  created_at: string;
}

export interface TimeOffRequest {
  id: string;
  staff_id: string;
  period_id: string | null;
  off_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  status: RequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export const DAY_LABELS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

export const ROLE_LABELS_JA: Record<UserRole, string> = {
  super_admin: "オーナー",
  staff: "スタッフ",
};

export const EMPLOYMENT_LABELS_JA: Record<EmploymentType, string> = {
  full_time: "正社員",
  part_time: "アルバイト",
};

export const PERIOD_STATUS_LABELS_JA: Record<PeriodStatus, string> = {
  draft: "下書き",
  published: "公開中",
  confirmed: "確定",
};

export const REQUEST_STATUS_LABELS_JA: Record<RequestStatus, string> = {
  pending: "申請中",
  approved: "承認",
  rejected: "却下",
};
