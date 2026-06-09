import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyLineSignature, replyLineMessage, locationQuickReply } from "@/lib/line";
import { handleOfferPostback } from "@/lib/offers/engine";
import { distanceMeters, storeGeofence, locationRequired } from "@/lib/geo";
import { emailToLoginId } from "@/lib/login-id";
import { appUrl } from "@/lib/app-url";
import { isSesameEnabled, sesameLock, sesameUnlock } from "@/lib/sesame";
import type { TimeRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

// JSTの日付文字列と時刻表示を返す
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
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}時間${m}分`;
}

type Admin = ReturnType<typeof createAdminClient>;

async function findOpen(admin: Admin, staffId: string): Promise<TimeRecord | null> {
  const { data } = await admin
    .from("time_records")
    .select("*")
    .eq("staff_id", staffId)
    .is("clock_out", null)
    .order("clock_in", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as TimeRecord | null) ?? null;
}

// 出勤打刻。すでに打刻中なら案内のみ。
async function punchIn(
  admin: Admin,
  staffId: string,
  loc?: { lat: number; lng: number }
): Promise<string> {
  const open = await findOpen(admin, staffId);
  if (open) {
    return `すでに出勤打刻済みです（${new Date(open.clock_in!).toLocaleTimeString("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
    })}〜）。退勤は「お疲れ様です」と送ってください。`;
  }
  const { iso, dateStr, hhmm } = jstNow();
  await admin.from("time_records").insert({
    staff_id: staffId,
    work_date: dateStr,
    clock_in: iso,
    source: "line",
    in_lat: loc?.lat ?? null,
    in_lng: loc?.lng ?? null,
  });
  return `おはようございます！${hhmm} に出勤を記録しました。今日もよろしくお願いします。`;
}

// 退勤打刻。打刻中が無ければ案内のみ。
async function punchOut(admin: Admin, staffId: string): Promise<string> {
  const open = await findOpen(admin, staffId);
  if (!open) {
    return "出勤の打刻が見つかりません。先に「おはようございます」で出勤を記録してください。";
  }
  const { iso, hhmm } = jstNow();
  await admin.from("time_records").update({ clock_out: iso, updated_at: iso }).eq("id", open.id);
  return `お疲れ様でした！${hhmm} に退勤を記録しました（勤務 ${fmtDuration(open.clock_in!, iso)}）。`;
}

const IN_WORDS = ["おはよう", "出勤", "おはよ"];
const OUT_WORDS = ["お疲れ", "おつかれ", "退勤", "おつ"];
const LOCK_WORDS = ["施錠", "しじょう", "鍵閉め", "閉錠"];
const UNLOCK_WORDS = ["解錠", "開錠", "開場", "かいじょう", "鍵開け"];

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const ok = await verifyLineSignature(raw, req.headers.get("x-line-signature"));
  if (!ok) return new Response("invalid signature", { status: 401 });

  let body: { events?: unknown[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const admin = createAdminClient();
  const events = (body.events ?? []) as Array<{
    type: string;
    replyToken?: string;
    source?: { userId?: string };
    message?: { type: string; text?: string; latitude?: number; longitude?: number };
    postback?: { data?: string };
  }>;

  for (const ev of events) {
    if (!ev.replyToken) continue;
    const lineUserId = ev.source?.userId;
    if (!lineUserId) continue;

    // 出勤打診の回答（クイックリプライの postback）
    if (ev.type === "postback") {
      const reply = await handleOfferPostback(admin, lineUserId, ev.postback?.data ?? "");
      if (reply) await replyLineMessage(ev.replyToken, reply);
      continue;
    }

    if (ev.type !== "message") continue;

    // LINEユーザー → スタッフ照合
    const { data: staff } = await admin
      .from("profiles")
      .select("id, full_name, initial_password, role")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    if (!staff) {
      await replyLineMessage(
        ev.replyToken,
        "このLINEアカウントはスタッフ登録されていません。先にアプリで「LINEでログイン」して連携してください。"
      );
      continue;
    }

    const msg = ev.message;
    if (!msg) continue;

    // 位置情報メッセージ → 距離を検証して自動で出勤/退勤
    if (msg.type === "location" && typeof msg.latitude === "number" && typeof msg.longitude === "number") {
      const gf = storeGeofence();
      if (gf) {
        const dist = distanceMeters(gf.lat, gf.lng, msg.latitude, msg.longitude);
        if (dist > gf.radius) {
          await replyLineMessage(
            ev.replyToken,
            `店舗の近く（${gf.radius}m以内）にいないため打刻できません。現在地は約${Math.round(dist)}m離れています。`
          );
          continue;
        }
      }
      const open = await findOpen(admin, staff.id);
      const reply = open
        ? await punchOut(admin, staff.id)
        : await punchIn(admin, staff.id, { lat: msg.latitude, lng: msg.longitude });
      await replyLineMessage(ev.replyToken, reply);
      continue;
    }

    // テキストメッセージ → キーワードで打刻 / ログイン情報照会
    if (msg.type === "text" && msg.text) {
      const t = msg.text;
      const lc = t.toLowerCase();

      // ログイン情報の問い合わせ（本人にのみ自分のID/PWを返す）
      const wantsCred =
        ["パスワード", "ぱすわーど", "ログイン", "ろぐいん", "アカウント", "あかうんと"].some((w) =>
          t.includes(w)
        ) ||
        lc.includes("id") ||
        lc.includes("pw");
      if (wantsCred) {
        const { data: authUser } = await admin.auth.admin.getUserById(staff.id);
        const loginId = emailToLoginId(authUser.user?.email ?? "");
        const pw = staff.initial_password;
        const reply = pw
          ? `${staff.full_name}さんのログイン情報です。\nID：${loginId}\nパスワード：${pw}\n${appUrl("/login")}\n※他の人に教えないでください。`
          : `ID：${loginId}\nパスワードは管理者にお問い合わせください。\n${appUrl("/login")}`;
        await replyLineMessage(ev.replyToken, reply);
        continue;
      }

      // 入口スマートロック（施錠/解錠）
      const isLock = LOCK_WORDS.some((w) => t.includes(w));
      const isUnlock = UNLOCK_WORDS.some((w) => t.includes(w));
      if (isSesameEnabled() && (isLock || isUnlock)) {
        // 一般スタッフはジオフェンス判定が必要なため、位置を取得できるメニューのボタンへ誘導。
        // オーナー(super_admin)は位置制限なしのためテキストから直接操作できる。
        if (staff.role !== "super_admin") {
          await replyLineMessage(
            ev.replyToken,
            "施錠/解錠はメニューの「🔓解錠」「🔒施錠」ボタンから行ってください（店舗周辺でのみ操作できます）。"
          );
          continue;
        }
        const ok = isLock ? await sesameLock(staff.full_name) : await sesameUnlock(staff.full_name);
        await replyLineMessage(
          ev.replyToken,
          ok
            ? isLock
              ? "🔒 施錠しました。"
              : "🔓 解錠しました。"
            : "ロックの操作に失敗しました。少し時間をおいて、もう一度お試しください。"
        );
        continue;
      }

      const isIn = IN_WORDS.some((w) => t.includes(w));
      const isOut = OUT_WORDS.some((w) => t.includes(w));

      if (!isIn && !isOut) {
        await replyLineMessage(
          ev.replyToken,
          "「おはようございます」で出勤、「お疲れ様です」で退勤を記録します。ログイン情報は「ID」または「パスワード」と送ってください。"
        );
        continue;
      }

      // 位置必須モード：位置情報を送ってもらってから打刻
      if (locationRequired()) {
        await replyLineMessage(
          ev.replyToken,
          "打刻するには、店舗で現在地を送ってください（下のボタン）。",
          locationQuickReply
        );
        continue;
      }

      const reply = isIn ? await punchIn(admin, staff.id) : await punchOut(admin, staff.id);
      await replyLineMessage(ev.replyToken, reply);
      continue;
    }
  }

  return new Response("OK", { status: 200 });
}
