// アプリ全体で使うドメイン型定義

export type UserRole = "super_admin" | "staff";
export type EmploymentType = "full_time" | "part_time";
export type AvailabilityPref = "preferred" | "available" | "unavailable";
export type PeriodStatus = "draft" | "published" | "confirmed";
export type RequestStatus = "pending" | "approved" | "rejected";
export type RequestType = "off" | "time_change";
export type WorkStatus = "active" | "on_leave" | "retired";

export interface Profile {
  id: string;
  full_name: string;
  display_name?: string | null;
  name_kana?: string | null; // カナ氏名（FC本部フォーム用）
  work_status?: WorkStatus; // 在籍状況（FC本部フォーム用）
  role: UserRole;
  employment_type: EmploymentType;
  phone: string | null;
  hourly_wage: number | null;
  commute_allowance?: number; // 月額交通費（円・固定。距離未設定時のフォールバック）
  commute_distance_km?: number | null; // 片道距離(km)。設定時は 片道×2×15円×勤務日数 で自動計算
  contracted_weekly_hours?: number | null; // 週の所定労働時間（社保判定用）
  tax_column?: "kou" | "otsu"; // 源泉の税区分。甲=扶養控除等申告書を当店に提出済み / 乙=未提出（他社が本業）
  dependents_count?: number; // 扶養親族等の数（甲欄の源泉計算用）
  emp_insurance_enrolled?: boolean; // 雇用保険 加入
  shaho_enrolled?: boolean; // 社会保険（健保・厚年）加入
  kaigo_applicable?: boolean; // 介護保険 第2号（40〜64歳）
  nomination_back_rate?: number; // 指名バック単価（円/指名）
  bank_code?: string | null; // 振込先 銀行コード(4)
  branch_code?: string | null; // 振込先 支店コード(3)
  account_type?: string | null; // 預金種目 1=普通 2=当座
  account_number?: string | null; // 口座番号
  recipient_kana?: string | null; // 受取人名カナ
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
  source: string; // "line" | "manual" | "liff" | "kiosk"
  in_lat: number | null;
  in_lng: number | null;
  in_photo_url?: string | null; // 出勤時セルフィー（Storage パス・キオスク打刻）
  out_photo_url?: string | null; // 退勤時セルフィー（Storage パス・キオスク打刻）
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

export interface PreopenShift {
  id: string;
  reserve_date: string; // "YYYY-MM-DD"
  staff_id: string;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  is_training: boolean;
  can_serve: boolean; // false = 出勤するが施術不可（受付数に数えない）
  created_at: string;
}

export interface StaffBlackout {
  id: string;
  staff_id: string;
  blackout_date: string; // "YYYY-MM-DD"
  start_time: string | null; // "HH:MM:SS" / null は終日不可
  end_time: string | null;
  title: string | null;
  source: string; // "timetree" | "manual"
  created_at: string;
}

export interface Receipt {
  id: string;
  image_url: string;
  detected_date: string | null;
  detected_amount: number | null;
  detected_merchant: string | null;
  suggested_account: string | null;
  payment_method?: "card" | "cash" | "personal" | null; // 支払手段（OCR判定＋手修正・null=不明）
  status: "pending" | "confirmed";
  created_at: string;
  updated_at: string;
}

export interface CardTransaction {
  id: string;
  transaction_date: string;
  amount: number;
  merchant_name: string | null;
  account?: string | null; // 勘定科目
  receipt_id: string | null;
  ec_order_id: string | null;
  created_at: string;
  updated_at: string;
}

export type StoreEventKind = "closed" | "note";

// 店休・店舗お知らせ（日単位イベント）。カレンダーの該当日にバナー表示する。
export interface StoreEvent {
  id: string;
  event_date: string; // "YYYY-MM-DD"
  kind: StoreEventKind; // closed=店休 / note=お知らせ
  title: string;
  body: string | null;
  start_time: string | null; // "HH:MM:SS"
  end_time: string | null;
  all_hands: boolean; // ※基本的に全員参加
  created_at: string;
}

export const STORE_EVENT_KIND_LABELS_JA: Record<StoreEventKind, string> = {
  closed: "店休",
  note: "お知らせ",
};

export const DAY_LABELS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

export const ROLE_LABELS_JA: Record<UserRole, string> = {
  super_admin: "オーナー",
  staff: "スタッフ",
};

export const EMPLOYMENT_LABELS_JA: Record<EmploymentType, string> = {
  full_time: "正社員",
  part_time: "アルバイト",
};

export const WORK_STATUS_LABELS_JA: Record<WorkStatus, string> = {
  active: "在籍中",
  on_leave: "休職中",
  retired: "退職",
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
