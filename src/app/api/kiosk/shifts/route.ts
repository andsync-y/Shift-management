import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { Shift } from "@/lib/types";

export const dynamic = "force-dynamic";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// タブレット（キオスク）下部のシフトカレンダー用：指定月の公開シフト・スタッフ・承認済み休みを返す。
//   GET /api/kiosk/shifts?token=<KIOSK_TOKEN>&month=YYYY-MM
export async function GET(req: NextRequest) {
  const expected = process.env.KIOSK_TOKEN;
  if (!expected) return NextResponse.json({ ok: false, error: "KIOSK_TOKEN が未設定です。" }, { status: 500 });
  const url = new URL(req.url);
  if (url.searchParams.get("token") !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const monthParam = url.searchParams.get("month");
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? "")
    ? monthParam!
    : `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}`;
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${pad(m)}-01`;
  const end = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;

  const admin = createAdminClient();
  const [{ data: shiftsRaw }, { data: staffRaw }, { data: offRaw }] = await Promise.all([
    admin.from("shifts").select("*").gte("work_date", start).lte("work_date", end),
    admin.from("profiles").select("*").eq("role", "staff").order("full_name"),
    admin
      .from("time_off_requests")
      .select("*")
      .eq("status", "approved")
      .gte("off_date", start)
      .lte("off_date", end),
  ]);

  const shifts = (shiftsRaw ?? []) as Shift[];
  // 下書き期間のシフトは除外
  const periodIds = [...new Set(shifts.map((s) => s.period_id))];
  let okPeriods = new Set<string>();
  if (periodIds.length) {
    const { data: per } = await admin.from("shift_periods").select("id, status").in("id", periodIds);
    okPeriods = new Set(
      ((per ?? []) as { id: string; status: string }[]).filter((p) => p.status !== "draft").map((p) => p.id)
    );
  }
  const visible = shifts.filter((s) => okPeriods.has(s.period_id));

  return NextResponse.json({ ok: true, year: y, month: m, shifts: visible, staff: staffRaw ?? [], timeOff: offRaw ?? [] });
}
