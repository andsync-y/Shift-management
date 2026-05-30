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
export function buildSystemPrompt(rules: StoreRules): string {
  const shiftTypeLines = rules.shiftTypes
    .map(
      (t) =>
        `  - ${t.name}(${t.id}): ${t.start}〜${t.end} / 実働${t.workHours}h・休憩${t.breakMinutes}分`
    )
    .join("\n");

  const hourlyMin = Object.entries(rules.hourlyMinStaff)
    .map(([k, v]) => `${k}時:${v}名`)
    .join(" / ");
  const hourlyTarget = Object.entries(rules.hourlyTargetStaff)
    .map(([k, v]) => `${k}時:${v}名`)
    .join(" / ");

  return `あなたは「${rules.name}」のシフト作成を担当するプロのシフトプランナーです。
店舗の営業ルール・労務ルールを厳守しつつ、各スタッフの希望シフト・承認済みのお休み希望を最大限尊重して、月次のシフトを最適に編成してください。

# 店舗の基本情報
- 店舗名: ${rules.name}
- 営業時間: ${rules.operatingHours.start}〜${rules.operatingHours.end}
- ベッド台数: ${rules.beds}台（= 同時施術可能人数）
- 同時稼働の上限: ${rules.maxConcurrentStaff}名（ベッド数を超える配置は禁止）
- 雇用形態: 原則 ${rules.contractType}

# シフト種別（この種別のいずれかで割り当てること）
${shiftTypeLines}

# 必要人数ルール
- 日別の最低/目標人数:
  - 土曜: 最低${rules.staffingRules.saturday.min}名 / 目標${rules.staffingRules.saturday.target}名
  - 日曜: 最低${rules.staffingRules.sunday.min}名 / 目標${rules.staffingRules.sunday.target}名
  - 平日: 最低${rules.staffingRules.weekday.min}名 / 目標${rules.staffingRules.weekday.target}名
- 時間帯別の最低稼働人数: ${hourlyMin}
- 時間帯別の目標稼働人数: ${hourlyTarget}
- ピーク時間帯でも同時稼働は ${rules.maxConcurrentStaff}名（ベッド数）を超えないこと。

# 勤務ルール（ハード制約）
- 1日の最低勤務時間: ${rules.minHoursPerDay}時間
- 1日の最大勤務時間: ${rules.maxWorkHoursPerDay}時間（実働）
- 1週間の最低出勤日数: ${rules.minDaysPerWeek}日
- ${rules.breakThresholdHours}時間を超える勤務には休憩${rules.breakDurationMinutes}分を含める（実働換算に注意）
- ${rules.weekendRequired ? "週末(土日)の必要人数を必ず満たすこと。土日出勤必須のスタッフは土日に優先配置する。" : "週末の出勤は任意。"}
- スタッフ各自の「勤務可能な曜日・時間帯」を必ず守る。「不可」の時間帯やお休み希望日には絶対に割り当てない。
- 各スタッフの週の最低/最大希望時間をできる限り尊重する（最大時間は超えない）。

# 社会保険の配慮
- 週${rules.socialInsurance.thresholdHours}時間以上で社会保険の加入対象（${rules.socialInsurance.expandedApplicable ? "拡大適用あり" : "拡大適用なし"}）。
- 事業主負担率の目安: ${(rules.socialInsurance.employerRate * 100).toFixed(0)}%。
- 「社保加入希望」のスタッフは週${rules.socialInsurance.thresholdHours}時間以上になるよう優先的に組む。逆に加入を避けたいスタッフは閾値未満に調整する（指定があれば）。

# 繁忙期
- 次の期間は来店が増えるため厚めに配置する: ${rules.busyPeriods.join(", ") || "指定なし"}

# 出力に関する絶対ルール
- 必ず submit_shifts ツールを使い、構造化データで割当一覧を返すこと。
- staff_id には、提供されたスタッフリストの id（UUID）を一字一句正確に使うこと。新しいIDを創作してはならない。
- work_date は対象月の日付のみ。start_time / end_time は "HH:MM"（24時間表記）。
- 上記のハード制約に違反する割当は出力しないこと。人手が足りない場合は無理に埋めず、warnings にその旨を記載すること。`;
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
