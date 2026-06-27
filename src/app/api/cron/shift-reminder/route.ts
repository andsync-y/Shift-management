import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { pushLineMessage } from "@/lib/line";
import { appUrl } from "@/lib/app-url";
import { runShiftReminder } from "@/lib/line/shift-reminder";

export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof createAdminClient>;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
// 現在の日本時間（年・月・日）
function jstParts() {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  return { y: jst.getUTCFullYear(), m: jst.getUTCMonth() + 1, d: jst.getUTCDate() };
}

// ---- 休み希望の提出催促（毎月8日=2日前 / 10日=当日） ----------------
async function runTimeoffReminder(admin: Admin, day: number) {
  const { y, m } = jstParts();
  // 翌月（締切10日で集めるのは翌月分）
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const start = `${ny}-${pad(nm)}-01`;
  const end = `${ny}-${pad(nm)}-${pad(new Date(ny, nm, 0).getDate())}`;

  // 連携済みの稼働スタッフ
  const { data: staffRaw } = await admin
    .from("profiles")
    .select("id, full_name, line_user_id")
    .eq("role", "staff")
    .eq("is_active", true)
    .not("line_user_id", "is", null);
  const staff = (staffRaw ?? []) as { id: string; full_name: string; line_user_id: string }[];

  // すでに翌月分を提出済みのスタッフ
  const { data: reqRaw } = await admin
    .from("time_off_requests")
    .select("staff_id")
    .gte("off_date", start)
    .lte("off_date", end);
  const submitted = new Set(((reqRaw ?? []) as { staff_id: string }[]).map((r) => r.staff_id));

  const deadline =
    day === 10
      ? `本日（10日）が${nm}月分の休み希望の提出期限です。`
      : `${nm}月分の休み希望の提出期限は2日後（10日）です。`;

  let sent = 0;
  for (const s of staff) {
    if (submitted.has(s.id)) continue; // 提出済みは送らない
    if (
      await pushLineMessage(
        s.line_user_id,
        `【お休み希望】${deadline}\nまだ提出がありません。アプリから提出してください 👉 ${appUrl("/staff/requests")}`
      )
    )
      sent++;
  }
  return { month: `${ny}-${pad(nm)}`, target: staff.length - submitted.size, sent };
}

// 毎日定時に実行。Vercel Cron（vercel.json）から。手動実行は ?key=<CRON_SECRET>。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET が未設定です" }, { status: 500 });
  const auth = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const shift = await runShiftReminder(admin);

  // 毎月8日(2日前) と 10日(当日) のみ休み希望の催促
  const { d } = jstParts();
  const timeoff = d === 8 || d === 10 ? await runTimeoffReminder(admin, d) : { skipped: `day=${d}` };

  return NextResponse.json({ ok: true, shift, timeoff });
}
