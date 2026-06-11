// =====================================================================
// 出勤打診エンジン
// =====================================================================
// 休み希望の承認で人員が不足したとき、他スタッフへ LINE で1人ずつ出勤を
// 打診し、最初に承諾した人を自動でシフトへ反映する。誰も見つからなければ
// オーナー（super_admin）へ通知する。
//
//   startOfferForApprovedRequest … 承認時に呼ぶ入口（不足検知→打診開始）
//   handleOfferPostback          … LINEの「入れます/むり」返答を処理
//   expireStaleOfferAsks         … 無返答のタイムアウト→次の人へ（Cron）
//
// すべて service role の admin クライアントで実行する（RLS バイパス）。
// 例外は握りつぶし、承認フロー本体を止めない設計。
// =====================================================================

import type { createAdminClient } from "@/lib/supabase/server";
import type { ShiftOffer, ShiftOfferCandidate } from "@/lib/types";
import { DAY_LABELS_JA } from "@/lib/types";
import { pushLineMessage, pushLineToMany, isLineNotifyEnabled } from "@/lib/line";
import { appUrl } from "@/lib/app-url";

type Admin = ReturnType<typeof createAdminClient>;

// 無返答で次の候補へ回すまでの時間（時間）。
const TIMEOUT_HOURS = Number(process.env.OFFER_TIMEOUT_HOURS || 3);

// --- 小さなユーティリティ -------------------------------------------
function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function mmdd(isoDate: string): string {
  const [, m, d] = isoDate.split("-").map(Number);
  return `${m}/${d}`;
}
function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}
function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function covers(aS: string, aE: string, bS: string, bE: string): boolean {
  return toMin(aS) <= toMin(bS) && toMin(aE) >= toMin(bE);
}
function overlaps(aS: string, aE: string, bS: string, bE: string): boolean {
  return toMin(aS) < toMin(bE) && toMin(bS) < toMin(aE);
}

// オーナー（連携済み super_admin）全員へ通知。
async function notifyOwners(admin: Admin, text: string): Promise<void> {
  const { data } = await admin
    .from("profiles")
    .select("line_user_id")
    .eq("role", "super_admin")
    .not("line_user_id", "is", null);
  const ids = ((data ?? []) as { line_user_id: string | null }[]).map((r) => r.line_user_id);
  await pushLineToMany(ids, text);
}

// --- 不足検知＋打診開始 ---------------------------------------------
// 早番=開始12時より前 / 遅番=開始12時以降（ShiftCalendarView の判定と同じ）。
function bandOf(start: string): "early" | "late" {
  return toMin(start) < 12 * 60 ? "early" : "late";
}
const BAND_LABEL: Record<"early" | "late", string> = { early: "早番", late: "遅番" };

type VacatedShift = { start_time: string; end_time: string };

type ApprovedRequest = {
  id: string;
  staff_id: string;
  off_date: string;
  request_type: string;
  // 終日休みの承認で削除した本人のその日のシフト（早番/遅番が無人になったかの判定に使う）
  vacatedShifts?: VacatedShift[];
};

// 終日休みの承認で「本人が抜けて早番/遅番が無人(0名)になった枠」を、その枠の時間で
// 他スタッフへ打診して埋める。早番・遅番は最低1名を確保する方針。
export async function startOfferForApprovedRequest(
  admin: Admin,
  request: ApprovedRequest
): Promise<void> {
  if (!isLineNotifyEnabled()) return; // 通知できない環境では何もしない
  if (request.request_type !== "off") return; // 時間変更は人員から外れないので対象外
  const vacated = request.vacatedShifts ?? [];
  if (vacated.length === 0) return; // 本人がその日シフトに入っていなければ欠員は生じない

  try {
    const date = request.off_date;
    const dow = weekdayOf(date);
    const [y, m] = date.split("-").map(Number);
    const { data: period } = await admin
      .from("shift_periods")
      .select("id")
      .eq("year", y)
      .eq("month", m)
      .maybeSingle();
    const periodId = (period as { id: string } | null)?.id ?? null;

    // この休み希望で既に作成済みの打診（時間帯）は二重に始めない
    const { data: existing } = await admin
      .from("shift_offers")
      .select("start_time")
      .eq("origin_request_id", request.id)
      .in("status", ["open", "filled"]);
    const coveredStarts = new Set(
      ((existing ?? []) as { start_time: string }[]).map((r) => r.start_time)
    );

    // その日の現在の割り当て（本人ぶんは承認時に削除済み）を早番/遅番で集計
    const { data: shiftRows } = await admin
      .from("shifts")
      .select("staff_id, start_time")
      .eq("work_date", date);
    const dayShifts = (shiftRows ?? []) as { staff_id: string; start_time: string }[];
    const assigned = new Set(dayShifts.map((r) => r.staff_id));
    const countByBand: Record<"early" | "late", number> = { early: 0, late: 0 };
    for (const s of dayShifts) countByBand[bandOf(s.start_time)] += 1;

    // 本人が抜けて 0 名になった枠だけを、本人のその枠のシフト時間で埋める
    const gaps = new Map<"early" | "late", VacatedShift>();
    for (const v of vacated) {
      const b = bandOf(v.start_time);
      if (countByBand[b] > 0) continue; // まだ誰かいる → 欠員なし
      if (!gaps.has(b)) gaps.set(b, v); // 代表のシフト時間を採用
    }
    if (gaps.size === 0) return;

    // 候補抽出の共通材料
    const { data: staffRows } = await admin
      .from("profiles")
      .select("id, full_name, line_user_id")
      .eq("role", "staff")
      .eq("is_active", true);
    const staff = (staffRows ?? []) as {
      id: string;
      full_name: string;
      line_user_id: string | null;
    }[];

    const { data: offRows } = await admin
      .from("time_off_requests")
      .select("staff_id, start_time, end_time")
      .eq("off_date", date)
      .eq("request_type", "off")
      .eq("status", "approved");
    const offList = (offRows ?? []) as {
      staff_id: string;
      start_time: string | null;
      end_time: string | null;
    }[];

    const { data: prefRows } = await admin
      .from("availability_preferences")
      .select("staff_id, start_time, end_time, preference")
      .eq("day_of_week", dow);
    const prefs = (prefRows ?? []) as {
      staff_id: string;
      start_time: string;
      end_time: string;
      preference: string;
    }[];

    for (const [band, slot] of gaps) {
      if (coveredStarts.has(slot.start_time)) continue; // 二重防止
      await startBandOffer(admin, {
        date,
        dow,
        periodId,
        band,
        slot,
        originRequestId: request.id,
        requesterId: request.staff_id,
        staff,
        offList,
        prefs,
        assigned,
      });
    }
  } catch (e) {
    // 承認処理本体は止めない
    console.error("startOfferForApprovedRequest failed:", e);
  }
}

// 1つの枠（早番 or 遅番）について、候補抽出 → 打診作成 → 先頭へ打診開始。
async function startBandOffer(
  admin: Admin,
  ctx: {
    date: string;
    dow: number;
    periodId: string | null;
    band: "early" | "late";
    slot: VacatedShift;
    originRequestId: string;
    requesterId: string;
    staff: { id: string; full_name: string; line_user_id: string | null }[];
    offList: { staff_id: string; start_time: string | null; end_time: string | null }[];
    prefs: { staff_id: string; start_time: string; end_time: string; preference: string }[];
    assigned: Set<string>;
  }
): Promise<void> {
  const { date, dow, periodId, band, slot, originRequestId, requesterId, staff, offList, prefs, assigned } = ctx;

  // その枠に出られない人（終日 or 枠に重なる承認済み休み）
  const offSet = new Set<string>();
  for (const o of offList) {
    if (!o.start_time || !o.end_time || overlaps(o.start_time, o.end_time, slot.start_time, slot.end_time)) {
      offSet.add(o.staff_id);
    }
  }

  // 候補: 連携済み / 本人でない / 休みでない / その日まだシフト無し / その枠に勤務可能
  const eligible = staff.filter((s) => {
    if (!s.line_user_id) return false;
    if (s.id === requesterId) return false;
    if (offSet.has(s.id)) return false;
    if (assigned.has(s.id)) return false;
    const mine = prefs.filter((p) => p.staff_id === s.id);
    const unavailable = mine.some(
      (p) => p.preference === "unavailable" && overlaps(p.start_time, p.end_time, slot.start_time, slot.end_time)
    );
    if (unavailable) return false;
    return mine.some(
      (p) => p.preference !== "unavailable" && covers(p.start_time, p.end_time, slot.start_time, slot.end_time)
    );
  });

  const label = `${mmdd(date)}(${DAY_LABELS_JA[dow]}) ${BAND_LABEL[band]} ${hhmm(slot.start_time)}–${hhmm(slot.end_time)}`;

  if (eligible.length === 0) {
    await notifyOwners(
      admin,
      `⚠ ${label} が無人になりますが、打診できる候補がいません。手動で調整してください。\n${appUrl("/admin/requests")}`
    );
    return;
  }

  // 公平性: これまで打診を受けた回数が少ない人を先に。
  const order = await fairnessOrder(admin, eligible.map((s) => s.id));
  const queue = [...eligible].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const { data: offerRow } = await admin
    .from("shift_offers")
    .insert({
      off_date: date,
      period_id: periodId,
      start_time: slot.start_time,
      end_time: slot.end_time,
      needed: 1,
      origin_request_id: originRequestId,
      status: "open",
    })
    .select("*")
    .single();
  const offer = offerRow as ShiftOffer;

  await admin.from("shift_offer_candidates").insert(
    queue.map((s, i) => ({ offer_id: offer.id, staff_id: s.id, position: i, status: "queued" }))
  );

  await notifyOwners(
    admin,
    `🔔 ${label} が無人になりました。出勤できそうな${queue.length}名に順番で打診を始めました。`
  );

  await advanceOffer(admin, offer.id);
}

// これまでに打診を受けた回数（少ない順に優先）。
async function fairnessOrder(admin: Admin, staffIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>(staffIds.map((id) => [id, 0]));
  const { data } = await admin
    .from("shift_offer_candidates")
    .select("staff_id, status")
    .in("staff_id", staffIds)
    .in("status", ["asked", "accepted", "declined", "skipped"]);
  for (const r of (data ?? []) as { staff_id: string }[]) {
    counts.set(r.staff_id, (counts.get(r.staff_id) ?? 0) + 1);
  }
  return counts;
}

// --- 次の候補へ打診（または終了） -----------------------------------
async function advanceOffer(admin: Admin, offerId: string): Promise<void> {
  const { data: offerRow } = await admin.from("shift_offers").select("*").eq("id", offerId).maybeSingle();
  const offer = offerRow as ShiftOffer | null;
  if (!offer || offer.status !== "open") return;

  if (offer.needed <= 0) {
    await admin.from("shift_offers").update({ status: "filled", updated_at: new Date().toISOString() }).eq("id", offerId);
    return;
  }

  // 既に誰かに打診中（asked）なら待つ
  const { data: askedRow } = await admin
    .from("shift_offer_candidates")
    .select("id")
    .eq("offer_id", offerId)
    .eq("status", "asked")
    .maybeSingle();
  if (askedRow) return;

  // 次の未連絡候補
  const { data: nextRow } = await admin
    .from("shift_offer_candidates")
    .select("*")
    .eq("offer_id", offerId)
    .eq("status", "queued")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  const next = nextRow as ShiftOfferCandidate | null;

  if (!next) {
    // 候補が尽きた → 終了してオーナーへ通知
    await admin.from("shift_offers").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", offerId);
    const dow = weekdayOf(offer.off_date);
    const label = `${mmdd(offer.off_date)}(${DAY_LABELS_JA[dow]}) ${hhmm(offer.start_time)}–${hhmm(offer.end_time)}`;
    await notifyOwners(
      admin,
      `❌ ${label} は誰も出勤できず、あと${offer.needed}名が埋まりませんでした。手動で調整してください。\n${appUrl("/admin/requests")}`
    );
    return;
  }

  // この候補へ打診
  const { data: staff } = await admin
    .from("profiles")
    .select("line_user_id, full_name")
    .eq("id", next.staff_id)
    .maybeSingle();
  const lineId = (staff as { line_user_id: string | null } | null)?.line_user_id ?? null;

  await admin
    .from("shift_offer_candidates")
    .update({ status: "asked", asked_at: new Date().toISOString() })
    .eq("id", next.id);

  const dow = weekdayOf(offer.off_date);
  const label = `${mmdd(offer.off_date)}(${DAY_LABELS_JA[dow]}) ${hhmm(offer.start_time)}–${hhmm(offer.end_time)}`;
  await pushLineMessage(
    lineId,
    `【出勤のお願い】${label} に人手が足りません。入っていただけませんか？\n下のボタンで回答してください（${TIMEOUT_HOURS}時間で次の方にお願いします）。`,
    offerQuickReply(offer.id, next.id)
  );
}

// 「入れます / むり」のクイックリプライ（postback）。
function offerQuickReply(offerId: string, candidateId: string) {
  const base = `t=offer&offer=${offerId}&cand=${candidateId}`;
  return {
    items: [
      {
        type: "action",
        action: { type: "postback", label: "入れます", data: `${base}&ans=yes`, displayText: "入れます" },
      },
      {
        type: "action",
        action: { type: "postback", label: "むり", data: `${base}&ans=no`, displayText: "むり" },
      },
    ],
  };
}

// --- LINE 返答（postback）の処理 -------------------------------------
// 戻り値: 返信メッセージ（webhook が replyToken で返す）。対象外なら null。
export async function handleOfferPostback(
  admin: Admin,
  lineUserId: string,
  data: string
): Promise<string | null> {
  const params = new URLSearchParams(data);
  if (params.get("t") !== "offer") return null;
  const offerId = params.get("offer");
  const candidateId = params.get("cand");
  const ans = params.get("ans");
  if (!offerId || !candidateId || !ans) return null;

  try {
    const { data: candRow } = await admin
      .from("shift_offer_candidates")
      .select("*")
      .eq("id", candidateId)
      .maybeSingle();
    const cand = candRow as ShiftOfferCandidate | null;
    if (!cand || cand.offer_id !== offerId) return "この打診は見つかりませんでした。";

    // 本人確認
    const { data: me } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("line_user_id", lineUserId)
      .maybeSingle();
    if (!me || (me as { id: string }).id !== cand.staff_id) return null;
    const myName = (me as { full_name: string }).full_name;

    const { data: offerRow } = await admin.from("shift_offers").select("*").eq("id", offerId).maybeSingle();
    const offer = offerRow as ShiftOffer | null;
    if (!offer) return "この打診は見つかりませんでした。";

    const dow = weekdayOf(offer.off_date);
    const label = `${mmdd(offer.off_date)}(${DAY_LABELS_JA[dow]}) ${hhmm(offer.start_time)}–${hhmm(offer.end_time)}`;

    if (offer.status !== "open") {
      return `${label} の募集はすでに締め切られました。ありがとうございます。`;
    }
    if (cand.status !== "asked") {
      return "この打診はすでに回答済みか、対象外です。";
    }

    const now = new Date().toISOString();

    if (ans === "no") {
      await admin
        .from("shift_offer_candidates")
        .update({ status: "declined", responded_at: now })
        .eq("id", cand.id);
      await advanceOffer(admin, offerId);
      return "承知しました。ありがとうございます、また機会があればお願いします。";
    }

    // ans === "yes": 承諾 → シフトへ反映
    await admin
      .from("shift_offer_candidates")
      .update({ status: "accepted", responded_at: now })
      .eq("id", cand.id);

    if (offer.period_id && offer.start_time && offer.end_time) {
      await admin.from("shifts").insert({
        period_id: offer.period_id,
        staff_id: cand.staff_id,
        work_date: offer.off_date,
        start_time: offer.start_time,
        end_time: offer.end_time,
        note: "出勤打診により追加",
        ai_generated: false,
      });
    }

    const remaining = Math.max(0, offer.needed - 1);
    await admin
      .from("shift_offers")
      .update({ needed: remaining, status: remaining <= 0 ? "filled" : "open", updated_at: now })
      .eq("id", offerId);

    // オーナーへ結果通知
    if (remaining <= 0) {
      await notifyOwners(admin, `✅ ${label} は ${myName} さんが入ってくれました（解決）。`);
    } else {
      await notifyOwners(admin, `✅ ${label} に ${myName} さんが入ってくれました（あと${remaining}名、引き続き打診します）。`);
      await advanceOffer(admin, offerId);
    }

    return `ありがとうございます！${label} のシフトに入れました。よろしくお願いします 🙏`;
  } catch (e) {
    console.error("handleOfferPostback failed:", e);
    return "エラーが発生しました。お手数ですが店長に連絡してください。";
  }
}

// --- タイムアウト（Cron）: 無返答の打診を次の人へ -------------------
export async function expireStaleOfferAsks(admin: Admin): Promise<{ advanced: number }> {
  if (!isLineNotifyEnabled()) return { advanced: 0 };
  const cutoff = new Date(Date.now() - TIMEOUT_HOURS * 3600 * 1000).toISOString();

  const { data: stale } = await admin
    .from("shift_offer_candidates")
    .select("id, offer_id, asked_at, status")
    .eq("status", "asked")
    .lt("asked_at", cutoff);

  const rows = (stale ?? []) as { id: string; offer_id: string }[];
  let advanced = 0;
  for (const r of rows) {
    await admin
      .from("shift_offer_candidates")
      .update({ status: "skipped", responded_at: new Date().toISOString() })
      .eq("id", r.id);
    await advanceOffer(admin, r.offer_id);
    advanced++;
  }
  return { advanced };
}
