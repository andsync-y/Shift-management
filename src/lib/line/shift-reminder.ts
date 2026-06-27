import { createAdminClient } from "@/lib/supabase/server";
import { pushLineMessage } from "@/lib/line";
import { DAY_LABELS_JA, type Shift } from "@/lib/types";

type Admin = ReturnType<typeof createAdminClient>;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// 翌日（JST）に公開済みシフトがあるスタッフへ「明日のシフト」連絡をLINEで送る。
// cron（毎日定時）と、オーナーの手動「今すぐ送信」ボタンの両方から呼ぶ。
// ※ 二重送信の抑止は無いため、手動で複数回押すと再送される。
export async function runShiftReminder(admin: Admin) {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  jst.setUTCDate(jst.getUTCDate() + 1);
  const iso = `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`;
  const label = `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}(${DAY_LABELS_JA[jst.getUTCDay()]})`;

  const { data: shiftsRaw } = await admin.from("shifts").select("*").eq("work_date", iso);
  const shifts = (shiftsRaw ?? []) as Shift[];
  if (shifts.length === 0) return { date: iso, sent: 0, note: "明日のシフトなし" };

  const periodIds = [...new Set(shifts.map((s) => s.period_id))];
  const { data: periodsRaw } = await admin.from("shift_periods").select("id, status").in("id", periodIds);
  const okPeriods = new Set(
    ((periodsRaw ?? []) as { id: string; status: string }[])
      .filter((p) => p.status !== "draft")
      .map((p) => p.id)
  );
  const valid = shifts.filter((s) => okPeriods.has(s.period_id));

  const byStaff = new Map<string, Shift[]>();
  for (const s of valid) (byStaff.get(s.staff_id) ?? byStaff.set(s.staff_id, []).get(s.staff_id)!).push(s);

  const staffIds = [...byStaff.keys()];
  if (staffIds.length === 0) return { date: iso, sent: 0, note: "公開済みシフトなし" };

  const { data: profilesRaw } = await admin
    .from("profiles")
    .select("id, line_user_id")
    .in("id", staffIds);
  const profMap = new Map(
    ((profilesRaw ?? []) as { id: string; line_user_id: string | null }[]).map((p) => [p.id, p])
  );

  let sent = 0;
  let noLine = 0;
  for (const [staffId, list] of byStaff) {
    const lid = profMap.get(staffId)?.line_user_id;
    if (!lid) {
      noLine++;
      continue;
    }
    const times = list
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((s) => `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`)
      .join("、");
    if (await pushLineMessage(lid, `【明日のシフト】${label}\n${times}\nよろしくお願いします。`)) sent++;
  }
  return { date: iso, label, target: staffIds.length, sent, noLine };
}
