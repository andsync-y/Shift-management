// =====================================================================
// 店舗ルール読み込みユーティリティ
// =====================================================================
// Vercel / .env.local に設定した「全力ストレッチ岐阜長良店」の営業ルール・
// シフトルールを環境変数から読み込み、型付きオブジェクトとして返す。
// JSON 系の環境変数はパースに失敗した場合、安全な既定値にフォールバックする。
// =====================================================================

export interface ShiftTypeRule {
  id: string;
  name: string;
  start: string;
  end: string;
  workHours: number;
  breakMinutes: number;
}

export interface StaffingRule {
  min: number;
  target: number;
}

export interface StoreRules {
  name: string;
  operatingHours: { start: string; end: string };
  beds: number;
  maxConcurrentStaff: number;
  contractType: string;
  shiftTypes: ShiftTypeRule[];
  staffingRules: {
    saturday: StaffingRule;
    sunday: StaffingRule;
    weekday: StaffingRule;
  };
  hourlyMinStaff: Record<string, number>;
  hourlyTargetStaff: Record<string, number>;
  minHoursPerDay: number;
  minDaysPerWeek: number;
  weekendRequired: boolean;
  breakThresholdHours: number;
  breakDurationMinutes: number;
  maxWorkHoursPerDay: number;
  socialInsurance: {
    thresholdHours: number;
    expandedApplicable: boolean;
    employerRate: number;
  };
  busyPeriods: string[];
}

// --- パースヘルパー --------------------------------------------------
function str(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

function json<T>(key: string, fallback: T): T {
  const raw = process.env[key];
  if (!raw || raw.trim() === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`[store-rules] 環境変数 ${key} のJSONパースに失敗しました。既定値を使用します。`);
    return fallback;
  }
}

// --- 既定値（環境変数未設定時のフォールバック） ----------------------
const DEFAULT_SHIFT_TYPES: ShiftTypeRule[] = [
  { id: "early", name: "早番", start: "10:00", end: "19:00", workHours: 8, breakMinutes: 60 },
  { id: "late", name: "遅番", start: "13:00", end: "22:00", workHours: 8, breakMinutes: 60 },
  { id: "short_5h", name: "早短5h", start: "10:00", end: "15:00", workHours: 5, breakMinutes: 0 },
  { id: "short_6h", name: "早短6h", start: "10:00", end: "16:00", workHours: 6, breakMinutes: 0 },
];

const DEFAULT_STAFFING = {
  saturday: { min: 3, target: 4 },
  sunday: { min: 3, target: 4 },
  weekday: { min: 3, target: 4 },
};

const DEFAULT_HOURLY_MIN = { "10-13": 2, "13-15": 3, "15-19": 2, "19-22": 2 };
const DEFAULT_HOURLY_TARGET = { "10-13": 2, "13-15": 4, "15-19": 3, "19-22": 2 };

// --- 本体 ------------------------------------------------------------
export function getStoreRules(): StoreRules {
  return {
    name: str("STORE_NAME", "全力ストレッチ岐阜長良店"),
    operatingHours: {
      start: str("STORE_OPERATING_HOURS_START", "10:00"),
      end: str("STORE_OPERATING_HOURS_END", "22:00"),
    },
    beds: num("STORE_BEDS", 4),
    maxConcurrentStaff: num("STORE_MAX_CONCURRENT_STAFF", 4),
    contractType: str("STORE_CONTRACT_TYPE", "アルバイト"),
    shiftTypes: json<ShiftTypeRule[]>("STORE_SHIFT_TYPES", DEFAULT_SHIFT_TYPES),
    staffingRules: json("STORE_STAFFING_RULES", DEFAULT_STAFFING),
    hourlyMinStaff: json<Record<string, number>>("STORE_HOURLY_MIN_STAFF", DEFAULT_HOURLY_MIN),
    hourlyTargetStaff: json<Record<string, number>>(
      "STORE_HOURLY_TARGET_STAFF",
      DEFAULT_HOURLY_TARGET
    ),
    minHoursPerDay: num("STORE_MIN_HOURS_PER_DAY", 5),
    minDaysPerWeek: num("STORE_MIN_DAYS_PER_WEEK", 2),
    weekendRequired: bool("STORE_WEEKEND_REQUIRED", true),
    breakThresholdHours: num("STORE_BREAK_THRESHOLD_HOURS", 6),
    breakDurationMinutes: num("STORE_BREAK_DURATION_MINUTES", 60),
    maxWorkHoursPerDay: num("STORE_MAX_WORK_HOURS_PER_DAY", 8),
    socialInsurance: {
      thresholdHours: num("STORE_SOCIAL_INSURANCE_THRESHOLD_HOURS", 30),
      expandedApplicable: bool("STORE_SOCIAL_INSURANCE_EXPANDED_APPLICABLE", false),
      employerRate: num("STORE_SOCIAL_INSURANCE_EMPLOYER_RATE", 0.15),
    },
    busyPeriods: json<string[]>("STORE_BUSY_PERIODS", ["GW", "OBON", "YEAREND"]),
  };
}

// AIモデルは環境変数で上書き可能（既定は最新の Sonnet）
export function getAnthropicModel(): string {
  return str("ANTHROPIC_MODEL", "claude-sonnet-4-6");
}
