import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { pushLineMessage } from "@/lib/line";
import type { Shift } from "@/lib/types";

export const dynamic = "force-dynamic";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toMin(t: string) {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

// 出勤/退勤の打刻リマインド。
// シフト開始時刻を過ぎても出勤打刻が無い人へ「出勤の打刻をお願いします」、
// 終了時刻を過ぎても退勤打刻が無い（出勤済み）人へ「退勤の打刻をお願いします」を送る。
// 二重送信は clock_reminders(shift_id, kind) で防止。
// ※ 時刻どおりに送るには、このエンドポイントを数分〜10分間隔で叩く必要がある
//   （Vercel Pro の Cron か、外部スケジューラ cron-job.org 等から ?key=CRON_SECRET）。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET が未設定です" }, { status: 500 });
  const auth = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const today = `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`;
  const nowMin = jst.getUTCHours() * 60 + jst.getUTCMinutes();

  // 当日のシフト（下書き期間は除外）
  const { data: shiftsRaw } = await admin.from("shifts").select("*").eq("work_date", today);
  const shifts = (shiftsRaw ?? []) as Shift[];
  if (shifts.length === 0) return NextResponse.json({ ok: true, date: today, sent: 0, note: "本日のシフトなし" });

  const periodIds = [...new Set(shifts.map((s) => s.period_id))];
  const { data: periodsRaw } = await admin.from("shift_periods").select("id, status").in("id", periodIds);
  const okPeriods = new Set(
    ((periodsRaw ?? []) as { id: string; status: string }[]).filter((p) => p.status !== "draft").map((p) => p.id)
  );
  const valid = shifts.filter((s) => okPeriods.has(s.period_id));
  if (valid.length === 0) return NextResponse.json({ ok: true, date: today, sent: 0, note: "公開済みシフトなし" });

  const staffIds = [...new Set(valid.map((s) => s.staff_id))];

  // LINE連携・本日の打刻・送信済みリマインドをまとめて取得
  const [{ data: profRaw }, { data: recRaw }, { data: sentRaw }] = await Promise.all([
    admin.from("profiles").select("id, line_user_id").in("id", staffIds),
    admin.from("time_records").select("staff_id, clock_in, clock_out").eq("work_date", today),
    admin.from("clock_reminders").select("shift_id, kind").in(
      "shift_id",
      valid.map((s) => s.id)
    ),
  ]);

  const lineByStaff = new Map(
    ((profRaw ?? []) as { id: string; line_user_id: string | null }[]).map((p) => [p.id, p.line_user_id])
  );
  // 本日、出勤打刻があるか / 出勤中（退勤前）か
  const hasClockIn = new Set<string>();
  const hasOpen = new Set<string>();
  for (const r of (recRaw ?? []) as { staff_id: string; clock_in: string | null; clock_out: string | null }[]) {
    if (r.clock_in) hasClockIn.add(r.staff_id);
    if (r.clock_in && !r.clock_out) hasOpen.add(r.staff_id);
  }
  const already = new Set(
    ((sentRaw ?? []) as { shift_id: string; kind: string }[]).map((r) => `${r.shift_id}_${r.kind}`)
  );

  let sentIn = 0;
  let sentOut = 0;
  for (const s of valid) {
    const lid = lineByStaff.get(s.staff_id);
    if (!lid) continue;
    const start = s.start_time.slice(0, 5);
    const end = s.end_time.slice(0, 5);

    // 出勤リマインド: 開始を過ぎても出勤打刻が無い
    if (nowMin >= toMin(s.start_time) && !hasClockIn.has(s.staff_id) && !already.has(`${s.id}_in`)) {
      const ok = await pushLineMessage(
        lid,
        `【打刻のお願い】本日 ${start}〜${end} のシフトです。\n出勤の打刻をお願いします🙏\n「おはようございます」と送ると出勤打刻になります。`
      );
      if (ok) {
        await admin.from("clock_reminders").upsert(
          { shift_id: s.id, kind: "in" },
          { onConflict: "shift_id,kind", ignoreDuplicates: true }
        );
        already.add(`${s.id}_in`);
        sentIn++;
      }
    }

    // 退勤リマインド: 終了を過ぎても退勤打刻が無い（出勤中）
    if (nowMin >= toMin(s.end_time) && hasOpen.has(s.staff_id) && !already.has(`${s.id}_out`)) {
      const ok = await pushLineMessage(
        lid,
        `【打刻のお願い】${end} でシフト終了です。\n退勤の打刻をお願いします🙏\n「お疲れ様です」と送ると退勤打刻になります。`
      );
      if (ok) {
        await admin.from("clock_reminders").upsert(
          { shift_id: s.id, kind: "out" },
          { onConflict: "shift_id,kind", ignoreDuplicates: true }
        );
        already.add(`${s.id}_out`);
        sentOut++;
      }
    }
  }

  return NextResponse.json({ ok: true, date: today, sentIn, sentOut });
}
