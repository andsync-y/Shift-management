// アプリ全体で使うドメイン型定義

export type UserRole = "super_admin" | "staff";
export type EmploymentType = "full_time" | "part_time";
export type AvailabilityPref = "preferred" | "available" | "unavailable";
export type PeriodStatus = "draft" | "published" | "confirmed";
export type RequestStatus = "pending" | "approved" | "rejected";
export type RequestType = "off" | "time_change";

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
  line_user_id: string | null;
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
  request_type: RequestType;
  status: RequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type OfferStatus = "open" | "filled" | "failed" | "canceled";
export type OfferCandidateStatus =
  | "queued"
  | "asked"
  | "accepted"
  | "declined"
  | "skipped";

export interface ShiftOffer {
  id: string;
  off_date: string; // "YYYY-MM-DD"
  period_id: string | null;
  start_time: string | null;
  end_time: string | null;
  needed: number; // 残り必要人数
  origin_request_id: string | null;
  status: OfferStatus;
  created_at: string;
  updated_at: string;
}

export interface ShiftOfferCandidate {
  id: string;
  offer_id: string;
  staff_id: string;
  position: number;
  status: OfferCandidateStatus;
  asked_at: string | null;
  responded_at: string | null;
  created_at: string;
}

export interface TimeRecord {
  id: string;
  staff_id: string;
  work_date: string; // "YYYY-MM-DD"（JST出勤日）
  clock_in: string | null; // ISO timestamptz
  clock_out: string | null;
  source: string; // "line" | "manual"
  in_lat: number | null;
  in_lng: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface PreopenReservation {
  id: string;
  staff_id: string;
  reserve_date: string; // "YYYY-MM-DD"
  start_time: string; // "HH:MM:SS"
  end_time: string;
  customer_name: string;
  is_free?: boolean; // true=フリー（誰が施術してもよい）/ false=登録者が施術
  note: string | null;
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
