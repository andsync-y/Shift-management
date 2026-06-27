import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/display-name";
import type { Profile, Shift, TimeRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function jstToday() {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}`;
}
function hhmmJst(iso: string) {
  const j = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${pad(j.getUTCHours())}:${pad(j.getUTCMinutes())}`;
}

// タブレット（キオスク）用：本日シフトのあるスタッフと各自の打刻状態を返す。
//   GET /api/kiosk/today?token=<KIOSK_TOKEN>
export async function GET(req: NextRequest) {
  const expected = process.env.KIOSK_TOKEN;
  if (!expected) return NextResponse.json({ ok: false, error: "KIOSK_TOKEN が未設定です。" }, { status: 500 });
  const token = new URL(req.url).searchParams.get("token");
  if (token !== expected) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const today = jstToday();

  const { data: shiftsRaw } = await admin.from("shifts").select("*").eq("work_date", today);
  const shifts = (shiftsRaw ?? []) as Shift[];

  // 下書き期間のシフトは除外
  const periodIds = [...new Set(shifts.map((s) => s.period_id))];
  let okPeriods = new Set<string>();
  if (periodIds.length) {
    const { data: periodsRaw } = await admin.from("shift_periods").select("id, status").in("id", periodIds);
    okPeriods = new Set(
      ((periodsRaw ?? []) as { id: string; status: string }[]).filter((p) => p.status !== "draft").map((p) => p.id)
    );
  }
  const valid = shifts.filter((s) => okPeriods.has(s.period_id));

  const byStaff = new Map<string, Shift[]>();
  for (const s of valid) (byStaff.get(s.staff_id) ?? byStaff.set(s.staff_id, []).get(s.staff_id)!).push(s);
  const staffIds = [...byStaff.keys()];
  if (staffIds.length === 0) return NextResponse.json({ ok: true, date: today, staff: [] });

  const [{ data: profRaw }, { data: recRaw }] = await Promise.all([
    admin.from("profiles").select("*").in("id", staffIds),
    admin.from("time_records").select("*").eq("work_date", today).in("staff_id", staffIds),
  ]);
  const profMap = new Map(((profRaw ?? []) as Profile[]).map((p) => [p.id, p]));
  const recs = (recRaw ?? []) as TimeRecord[];

  // staff_id → 最新の打刻状態
  const openByStaff = new Map<string, TimeRecord>();
  const lastByStaff = new Map<string, TimeRecord>();
  for (const r of recs.sort((a, b) => (a.clock_in ?? "").localeCompare(b.clock_in ?? ""))) {
    lastByStaff.set(r.staff_id, r);
    if (r.clock_in && !r.clock_out) openByStaff.set(r.staff_id, r);
  }

  const staff = staffIds
    .map((id) => {
      const p = profMap.get(id);
      if (!p) return null;
      const list = (byStaff.get(id) ?? []).sort((a, b) => a.start_time.localeCompare(b.start_time));
      const open = openByStaff.get(id);
      const last = lastByStaff.get(id);
      return {
        id,
        name: displayName(p),
        color: p.display_color,
        shifts: list.map((s) => `${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}`).join("、"),
        firstStart: list[0]?.start_time.slice(0, 5) ?? "99:99",
        open: !!open, // true=出勤中（次は退勤）
        inAt: open?.clock_in ? hhmmJst(open.clock_in) : null,
        outAt: !open && last?.clock_out ? hhmmJst(last.clock_out) : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.firstStart.localeCompare(b.firstStart));

  // 受付タブレットから印刷する書類のリンク（Googleドライブ等・環境変数で設定）
  const links = {
    counseling: process.env.COUNSELING_SHEET_URL ?? null,
    ticketTerms: process.env.TICKET_TERMS_URL ?? null,
  };

  return NextResponse.json({ ok: true, date: today, staff, links });
}
