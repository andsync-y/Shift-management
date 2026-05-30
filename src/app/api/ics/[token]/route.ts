import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// 各スタッフの確定/公開シフトを iCalendar (ICS) で配信する購読フィード。
// Google/Apple/Outlook などのカレンダーアプリが未ログインで取得するため、
// service role を使い、URL に含まれるトークンで本人のシフトのみ返す。

export const dynamic = "force-dynamic";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// "2026-06-20" + "10:00" -> "20260620T100000"（フローティング時間=端末ローカル扱い）
function dtLocal(dateStr: string, timeStr: string) {
  const d = dateStr.replace(/-/g, "");
  const t = timeStr.slice(0, 5).replace(":", "") + "00";
  return `${d}T${t}`;
}

function escapeText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// 75オクテットで折り返す（RFC5545）。ここでは簡易に文字数で折り返す。
function fold(line: string) {
  if (line.length <= 73) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 0) {
    chunks.push(" " + rest.slice(0, 72));
    rest = rest.slice(72);
  }
  return chunks.join("\r\n");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!/^[0-9a-fA-F-]{36}$/.test(token)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("calendar_token", token)
    .single();

  if (!profile) {
    return new NextResponse("Not found", { status: 404 });
  }

  // 公開 or 確定済みの期間のみ対象
  const { data: periods } = await supabase
    .from("shift_periods")
    .select("id")
    .in("status", ["published", "confirmed"]);
  const periodIds = (periods ?? []).map((p: { id: string }) => p.id);

  let shifts: { id: string; work_date: string; start_time: string; end_time: string; note: string | null }[] =
    [];
  if (periodIds.length > 0) {
    const { data } = await supabase
      .from("shifts")
      .select("id, work_date, start_time, end_time, note")
      .eq("staff_id", profile.id)
      .in("period_id", periodIds)
      .order("work_date");
    shifts = data ?? [];
  }

  const now = new Date();
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Zenryoku Stretch Nagara//Shift//JP",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:" + escapeText("全力ストレッチ岐阜長良店 シフト"),
    "X-WR-TIMEZONE:Asia/Tokyo",
  ];

  for (const s of shifts) {
    const summary = `勤務 ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${s.id}@zenryoku-nagara`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;TZID=Asia/Tokyo:${dtLocal(s.work_date, s.start_time)}`);
    lines.push(`DTEND;TZID=Asia/Tokyo:${dtLocal(s.work_date, s.end_time)}`);
    lines.push(fold("SUMMARY:" + escapeText(summary)));
    if (s.note) lines.push(fold("DESCRIPTION:" + escapeText(s.note)));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  const body = lines.join("\r\n") + "\r\n";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="shift.ics"',
      "Cache-Control": "no-cache, max-age=0",
    },
  });
}
