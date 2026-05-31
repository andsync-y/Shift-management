import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { pushLineMessage } from "@/lib/line";
import { DAY_LABELS_JA, type Shift } from "@/lib/types";

export const dynamic = "force-dynamic";

// 翌日（日本時間）の日付と表示ラベルを返す。Vercel は UTC で動くため +9h して算出する。
function tomorrowJst(): { iso: string; label: string } {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  jst.setUTCDate(jst.getUTCDate() + 1);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { iso, label: `${m}/${d}(${DAY_LABELS_JA[jst.getUTCDay()]})` };
}

// 毎日定時に実行：翌日にシフトがあるスタッフへ LINE で前日連絡する。
// Vercel Cron（vercel.json）から呼ばれる。手動実行は ?key=<CRON_SECRET> でも可。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET が未設定です" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { iso, label } = tomorrowJst();
  const admin = createAdminClient();

  const { data: shiftsRaw } = await admin.from("shifts").select("*").eq("work_date", iso);
  const shifts = (shiftsRaw ?? []) as Shift[];
  if (shifts.length === 0) {
    return NextResponse.json({ ok: true, date: iso, sent: 0, note: "明日のシフトはありません" });
  }

  // 下書き期間のシフトは連絡しない（公開/確定のみ）
  const periodIds = [...new Set(shifts.map((s) => s.period_id))];
  const { data: periodsRaw } = await admin
    .from("shift_periods")
    .select("id, status")
    .in("id", periodIds);
  const periods = (periodsRaw ?? []) as { id: string; status: string }[];
  const okPeriods = new Set(periods.filter((p) => p.status !== "draft").map((p) => p.id));
  const valid = shifts.filter((s) => okPeriods.has(s.period_id));

  // スタッフごとに当日のシフトをまとめる
  const byStaff = new Map<string, Shift[]>();
  for (const s of valid) {
    const arr = byStaff.get(s.staff_id);
    if (arr) arr.push(s);
    else byStaff.set(s.staff_id, [s]);
  }
  const staffIds = [...byStaff.keys()];
  if (staffIds.length === 0) {
    return NextResponse.json({ ok: true, date: iso, sent: 0, note: "公開済みのシフトはありません" });
  }

  const { data: profilesRaw } = await admin
    .from("profiles")
    .select("id, full_name, line_user_id")
    .in("id", staffIds);
  const profiles = (profilesRaw ?? []) as {
    id: string;
    full_name: string;
    line_user_id: string | null;
  }[];
  const profMap = new Map(profiles.map((p) => [p.id, p]));

  let sent = 0;
  let skipped = 0;
  for (const [staffId, list] of byStaff) {
    const p = profMap.get(staffId);
    if (!p?.line_user_id) {
      skipped++; // LINE未連携はスキップ
      continue;
    }
    const times = list
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((s) => `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`)
      .join("、");
    const ok = await pushLineMessage(
      p.line_user_id,
      `【明日のシフト】${label}\n${times}\nよろしくお願いします。`
    );
    if (ok) sent++;
    else skipped++;
  }

  return NextResponse.json({ ok: true, date: iso, staff: staffIds.length, sent, skipped });
}
