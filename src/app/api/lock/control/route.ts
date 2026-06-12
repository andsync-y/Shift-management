import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyLineIdToken } from "@/lib/line";
import { distanceMeters, storeGeofence } from "@/lib/geo";
import { isSesameEnabled, sesameLock, sesameStatus, sesameUnlock } from "@/lib/sesame";

export const dynamic = "force-dynamic";

// LIFF（LINE内のミニWeb）からの入口スマートロック操作。
// 連携済みの全スタッフが操作可。オーナー(super_admin)はどこからでも、
// 一般スタッフは店舗周辺（ジオフェンス）でのみ操作できる。
export async function POST(req: NextRequest) {
  if (!isSesameEnabled()) {
    return NextResponse.json(
      { ok: false, message: "スマートロックが未設定です。管理者にお問い合わせください。" },
      { status: 503 }
    );
  }

  let body: { idToken?: string; action?: string; lat?: number; lng?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "不正なリクエストです。" }, { status: 400 });
  }

  const action = body.action === "lock" || body.action === "unlock" ? body.action : null;
  if (!action) {
    return NextResponse.json({ ok: false, message: "操作の指定が不正です。" }, { status: 400 });
  }

  // 本人確認（LIFFのidTokenを検証してLINEユーザーIDを得る）
  const userId = body.idToken ? await verifyLineIdToken(body.idToken) : null;
  if (!userId) {
    return NextResponse.json(
      { ok: false, message: "認証に失敗しました。LINEから開き直してください。" },
      { status: 401 }
    );
  }

  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("profiles")
    .select("id, full_name, role")
    .eq("line_user_id", userId)
    .maybeSingle();
  if (!staff) {
    return NextResponse.json(
      {
        ok: false,
        needLink: true,
        message: "操作にはLINE連携が必要です。下のボタンから初回のひも付けをしてください。",
      },
      { status: 403 }
    );
  }

  const isOwner = staff.role === "super_admin";

  // 一般スタッフは店舗周辺のみ（オーナーはどこからでも可）。
  if (!isOwner) {
    const gf = storeGeofence();
    if (gf) {
      if (typeof body.lat !== "number" || typeof body.lng !== "number") {
        return NextResponse.json(
          { ok: false, message: "位置情報を取得できませんでした。位置情報を許可してください。" },
          { status: 400 }
        );
      }
      const dist = distanceMeters(gf.lat, gf.lng, body.lat, body.lng);
      if (dist > gf.radius) {
        return NextResponse.json(
          {
            ok: false,
            message: `店舗の近く（${gf.radius}m以内）にいないため操作できません。現在地は約${Math.round(
              dist
            )}m離れています。`,
          },
          { status: 200 }
        );
      }
    }
  }

  const ok =
    action === "lock" ? await sesameLock(staff.full_name) : await sesameUnlock(staff.full_name);
  if (!ok) {
    // 失敗時、鍵がクラウドから見えるか（＝店舗ネットに繋がっているか）を確認して案内を出し分ける。
    const reachable = (await sesameStatus()) !== null;
    const fallback =
      "鍵が開かない場合は、セサミ公式アプリ（Bluetoothで本体のそばから操作）または物理鍵をお使いください。";
    const message = reachable
      ? `ロックの操作に失敗しました。少し時間をおいて、もう一度お試しください。${fallback}`
      : `鍵に接続できませんでした。店舗のWi-Fi/ネット接続をご確認ください。${fallback}`;
    return NextResponse.json({ ok: false, offline: !reachable, message }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    action,
    message: action === "lock" ? "🔒 施錠しました。" : "🔓 解錠しました。開場します。",
  });
}
