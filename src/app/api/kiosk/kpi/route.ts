import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// kiosk用：最新の本部KPIスナップショットを返す（KIOSK_TOKEN保護）。
//   GET /api/kiosk/kpi?token=<KIOSK_TOKEN>
export async function GET(req: NextRequest) {
  const expected = process.env.KIOSK_TOKEN;
  if (!expected) return NextResponse.json({ ok: false, error: "KIOSK_TOKEN 未設定" }, { status: 500 });
  if (new URL(req.url).searchParams.get("token") !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("fc_kpi")
    .select("as_of, data, updated_at")
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ ok: true, snapshot: data ?? null });
}
