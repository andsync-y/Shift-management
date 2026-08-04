import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { purgeOldPunchPhotos } from "@/lib/punch-photos/purge";

export const dynamic = "force-dynamic";

// キオスク打刻写真の自動削除（既定90日より古いものを消す）。
// 認証は CRON_SECRET（Bearer / ?key=）。?days= で保持日数を上書き可。
// ※ 通常は毎日の shift-reminder cron から呼ばれるので、これは手動実行・調整用。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET が未設定です" }, { status: 500 });
  const auth = req.headers.get("authorization");
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const daysParam = Number(url.searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 90;

  try {
    const result = await purgeOldPunchPhotos(createAdminClient(), days);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
