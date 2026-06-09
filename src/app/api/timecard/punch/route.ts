import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyLineIdToken } from "@/lib/line";
import { distanceMeters, storeGeofence } from "@/lib/geo";
import type { TimeRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

function jstNow() {
  const d = new Date();
  const jst = new Date(d.getTime() + 9 * 3600 * 1000);
  const dateStr = `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(
    jst.getUTCDate()
  ).padStart(2, "0")}`;
  const hhmm = `${String(jst.getUTCHours()).padStart(2, "0")}:${String(jst.getUTCMinutes()).padStart(2, "0")}`;
  return { iso: d.toISOString(), dateStr, hhmm };
}
function fmtDuration(fromIso: string, toIso: string): string {
  const mins = Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000);
  return `${Math.floor(mins / 60)}時間${mins % 60}分`;
}

// LIFF（LINE内のミニWeb）からのワンタップ打刻。GPS座標を受け取り、店舗との距離を検証して記録する。
export async function POST(req: NextRequest) {
  let body: { idToken?: string; lat?: number; lng?: number; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "不正なリクエストです。" }, { status: 400 });
  }

  // 本人確認（idTokenを検証してLINEユーザーIDを得る）
  const userId = body.idToken ? await verifyLineIdToken(body.idToken) : null;
  if (!userId) {
    return NextResponse.json({ ok: false, message: "認証に失敗しました。LINEから開き直してください。" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("line_user_id", userId)
    .maybeSingle();
  if (!staff) {
    return NextResponse.json(
      {
        ok: false,
        needLink: true,
        message: "打刻にはLINE連携が必要です。下のボタンから初回のひも付けをしてください（ID・パスワードの入力は最初の1回だけです）。",
      },
      { status: 403 }
    );
  }

  // 位置チェック（STORE_LAT/LNG 設定時のみ。店舗の近くにいないと打刻不可）
  const gf = storeGeofence();
  if (gf) {
    if (typeof body.lat !== "number" || typeof body.lng !== "number") {
      return NextResponse.json({ ok: false, message: "位置情報を取得できませんでした。位置情報を許可してください。" }, { status: 400 });
    }
    const dist = distanceMeters(gf.lat, gf.lng, body.lat, body.lng);
    if (dist > gf.radius) {
      return NextResponse.json(
        { ok: false, message: `店舗の近く（${gf.radius}m以内）にいないため打刻できません。現在地は約${Math.round(dist)}m離れています。` },
        { status: 200 }
      );
    }
  }

  // 打刻中（退勤前）のレコードを取得
  const { data: openRaw } = await admin
    .from("time_records")
    .select("*")
    .eq("staff_id", staff.id)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();
  const open = openRaw as TimeRecord | null;

  const { iso, dateStr, hhmm } = jstNow();
  const action = body.action === "in" || body.action === "out" ? body.action : open ? "out" : "in";

  if (action === "in") {
    if (open) {
      return NextResponse.json({ ok: false, message: "すでに出勤打刻済みです。退勤する場合は「退勤」を押してください。" });
    }
    await admin.from("time_records").insert({
      staff_id: staff.id,
      work_date: dateStr,
      clock_in: iso,
      source: "liff",
      in_lat: body.lat ?? null,
      in_lng: body.lng ?? null,
    });
    return NextResponse.json({ ok: true, action: "in", message: `おはようございます！${hhmm} に出勤を記録しました。` });
  }

  // out
  if (!open) {
    return NextResponse.json({ ok: false, message: "出勤の打刻が見つかりません。先に「出勤」を押してください。" });
  }
  await admin.from("time_records").update({ clock_out: iso, updated_at: iso }).eq("id", open.id);
  return NextResponse.json({
    ok: true,
    action: "out",
    message: `お疲れ様でした！${hhmm} に退勤を記録しました（勤務 ${fmtDuration(open.clock_in!, iso)}）。`,
  });
}
