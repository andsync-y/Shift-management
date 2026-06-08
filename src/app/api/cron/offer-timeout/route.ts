import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { expireStaleOfferAsks } from "@/lib/offers/engine";

export const dynamic = "force-dynamic";

// 出勤打診の無返答タイムアウトを処理する Cron。
// 一定時間（OFFER_TIMEOUT_HOURS）返答がない候補を「次の人」へ自動で回す。
// Vercel Cron（vercel.json）から定期実行。手動実行は ?key=<CRON_SECRET>。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET が未設定です" }, { status: 500 });
  const auth = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await expireStaleOfferAsks(createAdminClient());
  return NextResponse.json({ ok: true, ...result });
}
