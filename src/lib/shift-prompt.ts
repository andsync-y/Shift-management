// =====================================================================
// Claude API 用 シフト生成プロンプト構築
// =====================================================================
// getStoreRules() の店舗ルールと、Supabase から取得したスタッフ条件・希望休を
// もとに、Claude に渡すシステムプロンプト / ユーザープロンプトを組み立てる。
//
// ★ システムプロンプト本文を独自テンプレートに差し替えたい場合は
//    buildSystemPrompt() の戻り値を編集してください（店舗ルールは rules から展開）。
// =====================================================================

import type { StoreRules } from "@/lib/store-rules";
import type {
  AvailabilityPreference,
  Profile,
  TimeOffRequest,
} from "@/lib/types";

const DAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

// --- システムプロンプト ----------------------------------------------
// ★ 指定テンプレートをそのまま使用し、{...} プレースホルダーを store-rules から展開する。
export function buildSystemPrompt(rules: StoreRules): string {
  const shiftTypeLines = rules.shiftTypes
    .map(
      (t) =>
        `- ${t.name}: ${t.start}-${t.end}（実働${t.workHours}h、休憩${
          t.breakMinutes > 0 ? `${t.breakMinutes}分` : "なし"
        }）`
    )
    .join("\n");

  const hMin = rules.hourlyMinStaff;
  const hTgt = rules.hourlyTargetStaff;
  const employerPct = rules.socialInsurance.employerRate * 100;

  return `あなたは「${rules.name}」のシフト作成AIです。
以下の店舗ルールとスタッフ条件に基づき、指定された週の最適なシフトを生成してください。

## 店舗基本情報
- 店名: ${rules.name}
- 営業時間: ${rules.operatingHours.start}-${rules.operatingHours.end}
- ベッド数: ${rules.beds}台
- 同時施術可能人数: ${rules.maxConcurrentStaff}名（= ベッド数）
- 契約形態: 全員${rules.contractType}

## シフト種別
${shiftTypeLines}

## 絶対制約（違反禁止）
1. 同時稼働人数が${rules.maxConcurrentStaff}名を超えないこと
2. スタッフのavailabilityで「unavailable」の曜日には絶対に配置しない
3. max_end_timeが設定されている場合、その時刻までに勤務終了する
4. 1日の勤務は${rules.minHoursPerDay}時間以上
5. 週の出勤は${rules.minDaysPerWeek}日以上
6. 土日のいずれか必ず1日以上出勤
7. ${rules.breakThresholdHours}時間超の勤務には${rules.breakDurationMinutes}分の休憩を入れる
8. 1日の実働は${rules.maxWorkHoursPerDay}時間以内
9. 希望休（shift_requests）で「day_off」指定の日は休みにする
10. 繁忙期（${rules.busyPeriods.join(", ")}）は希望休を原則不可とする

## 日別人数配置ルール
- 土曜: 最低${rules.staffingRules.saturday.min}名、目標${rules.staffingRules.saturday.target}名
- 日曜: 最低${rules.staffingRules.sunday.min}名、目標${rules.staffingRules.sunday.target}名
- 平日: 最低${rules.staffingRules.weekday.min}名、目標${rules.staffingRules.weekday.target}名

## 時間帯別稼働人数（全曜日共通）
- 10:00-13:00: 最低${hMin["10-13"]}名 / 目標${hTgt["10-13"]}名
- 13:00-15:00: 最低${hMin["13-15"]}名 / 目標${hTgt["13-15"]}名（ピーク帯）
- 15:00-19:00: 最低${hMin["15-19"]}名 / 目標${hTgt["15-19"]}名
- 19:00-22:00: 最低${hMin["19-22"]}名 / 目標${hTgt["19-22"]}名

## 最適化目標（この優先順で判断）
1. 全営業時間帯に最低2名は配置する（1名体制を絶対に避ける）
2. ピーク帯（13:00-15:00）にベッド満稼働（${rules.maxConcurrentStaff}名）を目指す
3. 各日の出勤人数が日別配置ルールの最低人数以上であること
4. 社保加入希望者（social_insurance_desired=true）は週${rules.socialInsurance.thresholdHours}時間以上になるようシフトを組む
5. 各スタッフの希望出勤日数（desired_days_per_week）に近づける
6. 土日は目標人数配置を優先する

## 社会保険の判定基準
- 週${rules.socialInsurance.thresholdHours}時間以上: 強制加入
- 週20-${rules.socialInsurance.thresholdHours}時間: 任意（当店は拡大適用対象外）
- 週20時間未満: 非該当
- 事業主負担: 給与の約${employerPct}%

## 出力形式
必ず以下のJSON形式のみで出力してください。JSON以外のテキストは一切含めないでください。

{
  "schedule": [
    {
      "staff_id": "uuid",
      "staff_name": "名前",
      "entries": [
        {
          "date": "YYYY-MM-DD",
          "day_of_week": "土|日|月|火|水|木|金",
          "shift_type": "early|late|short_5h|short_6h|off",
          "start_time": "HH:MM",
          "end_time": "HH:MM",
          "work_hours": 8,
          "break_minutes": 60
        }
      ],
      "weekly_summary": {
        "work_days": 4,
        "total_hours": 32,
        "insurance_status": "加入|任意|非該当"
      }
    }
  ],
  "daily_summary": [
    {
      "date": "YYYY-MM-DD",
      "day_of_week": "土",
      "staff_count": 4,
      "hourly_staffing": {
        "10": 2, "11": 2, "12": 2,
        "13": 4, "14": 4, "15": 3,
        "16": 3, "17": 3, "18": 3,
        "19": 2, "20": 2, "21": 2
      }
    }
  ],
  "warnings": ["問題点や注意事項を文字列配列で"],
  "insurance_summary": {
    "enrolled": ["加入対象者名"],
    "optional": ["任意対象者名"],
    "estimated_monthly_cost": 95000
  }
}

制約違反がある場合はwarningsに具体的に明記してください。`;
}

// --- ユーザープロンプト（対象月・スタッフ・希望休） ------------------
export interface BuildUserPromptParams {
  year: number;
  month: number;
  staff: Profile[];
  availability: AvailabilityPreference[];
  timeOff: TimeOffRequest[];
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function buildUserContent(params: BuildUserPromptParams): string {
  const { year, month, staff, availability, timeOff } = params;

  // 対象月の日付一覧
  const lastDay = new Date(year, month, 0).getDate();
  const dateLines: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    dateLines.push(`${year}-${pad(month)}-${pad(d)}(${DAY_JA[dow]})`);
  }

  // スタッフごとの情報
  const availByStaff = new Map<string, AvailabilityPreference[]>();
  for (const a of availability) {
    if (!availByStaff.has(a.staff_id)) availByStaff.set(a.staff_id, []);
    availByStaff.get(a.staff_id)!.push(a);
  }
  const offByStaff = new Map<string, TimeOffRequest[]>();
  for (const o of timeOff) {
    if (!offByStaff.has(o.staff_id)) offByStaff.set(o.staff_id, []);
    offByStaff.get(o.staff_id)!.push(o);
  }

  const staffBlocks = staff
    .filter((s) => s.is_active)
    .map((s) => {
      const avail = (availByStaff.get(s.id) ?? [])
        .sort((a, b) => a.day_of_week - b.day_of_week)
        .map(
          (a) =>
            `      ${DAY_JA[a.day_of_week]}: ${a.start_time.slice(0, 5)}〜${a.end_time.slice(
              0,
              5
            )} [${a.preference === "preferred" ? "優先" : a.preference === "available" ? "可" : "不可"}]`
        )
        .join("\n");
      const offs = (offByStaff.get(s.id) ?? [])
        .map(
          (o) =>
            `      ${o.off_date}${
              o.start_time && o.end_time
                ? ` ${o.start_time.slice(0, 5)}〜${o.end_time.slice(0, 5)}`
                : "（終日）"
            }`
        )
        .join("\n");

      return `- id: ${s.id}
    氏名: ${s.full_name}
    雇用形態: ${s.employment_type === "full_time" ? "正社員" : "アルバイト"}
    週の希望時間: ${s.min_hours_per_week}〜${s.max_hours_per_week}h
    勤務可能(希望シフト):
${avail || "      （登録なし＝勤務不可として扱う）"}
    承認済みお休み希望:
${offs || "      （なし）"}`;
    })
    .join("\n\n");

  return `# 対象月
${year}年${month}月（${lastDay}日まで）

# 対象日付
${dateLines.join(" / ")}

# スタッフ一覧（このidをそのまま使うこと）
${staffBlocks}

以上の条件で、${year}年${month}月の最適なシフトを編成し、submit_shifts ツールで提出してください。`;
}
