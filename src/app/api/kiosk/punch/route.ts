import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { TimeRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function jstNow() {
  const d = new Date();
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  return {
    iso: d.toISOString(),
    dateStr: `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}`,
    hhmm: `${pad(j.getUTCHours())}:${pad(j.getUTCMinutes())}`,
  };
}
function fmtDuration(fromIso: string, toIso: string) {
  const mins = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000));
  return `${Math.floor(mins / 60)}時間${mins % 60}分`;
}

// data:image/jpeg;base64,xxxx → Buffer（失敗時 null）
function decodeDataUrl(dataUrl: string | undefined): Buffer | null {
  if (!dataUrl) return null;
  const m = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    return Buffer.from(m[1], "base64");
  } catch {
    return null;
  }
}

// タブレット（キオスク）打刻。名前で本人を指定し、セルフィー写真を添えて記録する。
//   POST /api/kiosk/punch  { token, staffId, action?, photo? }
export async function POST(req: NextRequest) {
  const expected = process.env.KIOSK_TOKEN;
  if (!expected) return NextResponse.json({ ok: false, message: "KIOSK_TOKEN が未設定です。" }, { status: 500 });

  let body: { token?: string; staffId?: string; action?: string; photo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "不正なリクエストです。" }, { status: 400 });
  }
  if (body.token !== expected) return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  if (!body.staffId) return NextResponse.json({ ok: false, message: "スタッフが指定されていません。" }, { status: 400 });

  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("profiles")
    .select("id, full_name, display_name")
    .eq("id", body.staffId)
    .maybeSingle();
  if (!staff) return NextResponse.json({ ok: false, message: "スタッフが見つかりません。" }, { status: 404 });
  const name = (staff as { display_name: string | null; full_name: string }).display_name || (staff as { full_name: string }).full_name;

  // 打刻中（退勤前）のレコード
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

  // セルフィーを Storage に保存（任意・失敗しても打刻は通す）
  let photoPath: string | null = null;
  const bytes = decodeDataUrl(body.photo);
  if (bytes && bytes.length > 0) {
    const path = `${dateStr}/${staff.id}-${Date.now()}.jpg`;
    const up = await admin.storage.from("punch-photos").upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (!up.error) photoPath = path;
  }

  if (action === "in") {
    if (open) {
      return NextResponse.json({ ok: false, message: `${name}さんはすでに出勤中です。退勤する場合は「退勤」を押してください。` });
    }
    await admin.from("time_records").insert({
      staff_id: staff.id,
      work_date: dateStr,
      clock_in: iso,
      source: "kiosk",
      in_photo_url: photoPath,
    });
    return NextResponse.json({ ok: true, action: "in", name, time: hhmm, message: `${name}さん、おはようございます！${hhmm} 出勤を記録しました。` });
  }

  // out
  if (!open) {
    return NextResponse.json({ ok: false, message: `${name}さんの出勤打刻が見つかりません。先に「出勤」を押してください。` });
  }
  await admin
    .from("time_records")
    .update({ clock_out: iso, out_photo_url: photoPath ?? open.out_photo_url ?? null, updated_at: iso })
    .eq("id", open.id);
  return NextResponse.json({
    ok: true,
    action: "out",
    name,
    time: hhmm,
    message: `${name}さん、お疲れ様でした！${hhmm} 退勤を記録しました（勤務 ${fmtDuration(open.clock_in!, iso)}）。`,
  });
}
