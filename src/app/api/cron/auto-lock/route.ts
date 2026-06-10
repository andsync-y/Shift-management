import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isSesameEnabled, sesameStatus, sesameLock } from "@/lib/sesame";
import { pushLineMessage } from "@/lib/line";

export const dynamic = "force-dynamic";

// 無人時の自動施錠 Cron（鍵のかけ忘れ防止）。
// 「直近16時間以内に出勤(打刻)があり、いま誰も勤務中でない（＝全員 退勤済み）」状態が
// AUTO_LOCK_AFTER_MIN 分（既定15分）続いたら、まだ施錠されていなければ自動で施錠する。
//
// 在店判定は打刻（time_records）が根拠。退勤打刻が前提（退勤し忘れると無人と見なさない）。
// 重複施錠・重複通知は「現在のロック状態が unlocked のときだけ施錠する」ことで防止する。
//
// Vercel Hobby は Cron が1日1回までのため、外部スケジューラ（cron-job.org 等）から
// 5分間隔で GET し、`Authorization: Bearer <CRON_SECRET>` か `?key=<CRON_SECRET>` で認証する。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET が未設定です" }, { status: 500 });
  const auth = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!isSesameEnabled()) {
    return NextResponse.json({ ok: true, skipped: "sesame-disabled" });
  }
  const delayMin = Number(process.env.AUTO_LOCK_AFTER_MIN ?? "15");
  if (!Number.isFinite(delayMin) || delayMin <= 0) {
    return NextResponse.json({ ok: true, skipped: "auto-lock-disabled" });
  }

  const admin = createAdminClient();
  const sinceIso = new Date(Date.now() - 16 * 3600 * 1000).toISOString();
  const { data: recent } = await admin
    .from("time_records")
    .select("clock_in, clock_out")
    .gte("clock_in", sinceIso);
  const rows = (recent ?? []) as { clock_in: string; clock_out: string | null }[];

  // 勤務中（退勤していない）が一人でもいれば在店中 → 何もしない
  if (rows.some((r) => r.clock_out === null)) {
    return NextResponse.json({ ok: true, skipped: "occupied" });
  }

  // 無人になった時刻＝直近の退勤時刻。退勤実績が無ければ何もしない。
  const outs = rows.map((r) => r.clock_out).filter((v): v is string => !!v).sort();
  const lastOut = outs[outs.length - 1];
  if (!lastOut) return NextResponse.json({ ok: true, skipped: "no-activity" });

  const elapsedMin = (Date.now() - new Date(lastOut).getTime()) / 60000;
  if (elapsedMin < delayMin) {
    return NextResponse.json({
      ok: true,
      skipped: "waiting",
      elapsedMin: Math.round(elapsedMin),
      delayMin,
    });
  }

  // すでに施錠済み／状態不明なら何もしない（重複施錠・重複通知の防止）
  const status = await sesameStatus();
  if (status !== "unlocked") {
    return NextResponse.json({ ok: true, skipped: "not-unlocked", status });
  }

  const ok = await sesameLock("自動施錠（無人）");
  if (!ok) return NextResponse.json({ ok: false, error: "lock-failed" }, { status: 502 });

  // オーナー（super_admin）へ LINE 通知
  const minutes = Math.round(elapsedMin);
  const { data: owners } = await admin
    .from("profiles")
    .select("line_user_id")
    .eq("role", "super_admin");
  await Promise.all(
    ((owners ?? []) as { line_user_id: string | null }[])
      .map((o) => o.line_user_id)
      .filter((id): id is string => !!id)
      .map((id) =>
        pushLineMessage(id, `🔒 店舗が無人（最終退勤から約${minutes}分）のため、入口を自動施錠しました。`)
      )
  );

  return NextResponse.json({ ok: true, locked: true, elapsedMin: minutes });
}
