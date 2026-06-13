"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { pushLineMessage } from "@/lib/line";
import { startOfferForApprovedRequest } from "@/lib/offers/engine";

export async function reviewRequest(
  requestId: string,
  status: "approved" | "rejected"
) {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const { data: updated } = await supabase
    .from("time_off_requests")
    .update({
      status,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .select("id, staff_id, off_date, request_type, start_time, end_time")
    .maybeSingle();

  // 申請者へ LINE 通知（連携済みのみ・未設定なら no-op）
  if (updated) {
    const { data: staff } = await supabase
      .from("profiles")
      .select("line_user_id")
      .eq("id", updated.staff_id)
      .maybeSingle();
    const [, m, d] = String(updated.off_date).split("-");
    const kind = updated.request_type === "time_change" ? "時間変更希望" : "休み希望";
    const verb = status === "approved" ? "承認" : "却下";
    await pushLineMessage(
      staff?.line_user_id ?? null,
      `${Number(m)}/${Number(d)} の${kind}が【${verb}】されました。`
    );

    if (status === "approved") {
      // 終日休みの承認時: 本人のその日のシフトを削除（不要な出勤予定を消す）。
      // 削除前にシフト時間を控え、早番/遅番が無人になった枠の打診に使う。
      const isAllDayOff =
        updated.request_type === "off" && !updated.start_time && !updated.end_time;
      let vacatedShifts: { start_time: string; end_time: string }[] = [];
      if (isAllDayOff) {
        const { data: mine } = await supabase
          .from("shifts")
          .select("start_time, end_time")
          .eq("staff_id", updated.staff_id)
          .eq("work_date", updated.off_date);
        vacatedShifts = (mine ?? []) as { start_time: string; end_time: string }[];
        await supabase
          .from("shifts")
          .delete()
          .eq("staff_id", updated.staff_id)
          .eq("work_date", updated.off_date);
      } else if (
        updated.request_type === "time_change" &&
        updated.start_time &&
        updated.end_time
      ) {
        // 時間変更の承認: その日の本人シフトを希望時間へ置き換える（前のシフトを残さない）。
        await supabase
          .from("shifts")
          .update({
            start_time: updated.start_time,
            end_time: updated.end_time,
            note: "時間変更",
          })
          .eq("staff_id", updated.staff_id)
          .eq("work_date", updated.off_date);
      }

      // 早番/遅番が無人になったら他スタッフへ自動で出勤打診を開始する。
      await startOfferForApprovedRequest(createAdminClient(), {
        id: updated.id,
        staff_id: updated.staff_id,
        off_date: updated.off_date,
        request_type: updated.request_type,
        vacatedShifts,
      });
    }
  }

  // 承認/却下はカレンダー各所の表示にも影響するので、関連ページもまとめて再検証する
  revalidatePath("/admin/requests");
  revalidatePath("/admin");
  revalidatePath("/admin/shifts", "layout");
  revalidatePath("/staff");
}

// 既に承認済みの「終日休み」に対して、本人のその日のシフトが残っていれば一括削除する。
// 自動削除を導入する前に承認された分を掃除するための一回限りのメンテ操作。
export async function cleanupApprovedOffShifts(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: offs, error } = await supabase
    .from("time_off_requests")
    .select("staff_id, off_date, request_type, start_time, end_time")
    .eq("status", "approved");
  if (error) return { ok: false, message: error.message };

  // 終日休み（時間指定なし）のみ対象
  const allDay = (offs ?? []).filter(
    (o) => o.request_type === "off" && !o.start_time && !o.end_time
  );
  let removed = 0;
  for (const o of allDay) {
    const { data: deleted } = await supabase
      .from("shifts")
      .delete()
      .eq("staff_id", o.staff_id)
      .eq("work_date", o.off_date)
      .select("id");
    removed += deleted?.length ?? 0;
  }

  // 承認済みの時間変更を実シフトへ反映（前のシフトが残っているものを置換）
  const changes = (offs ?? []).filter(
    (o) => o.request_type === "time_change" && o.start_time && o.end_time
  );
  let changed = 0;
  for (const c of changes) {
    const { data: updated } = await supabase
      .from("shifts")
      .update({ start_time: c.start_time, end_time: c.end_time, note: "時間変更" })
      .eq("staff_id", c.staff_id)
      .eq("work_date", c.off_date)
      .select("id");
    changed += updated?.length ?? 0;
  }

  revalidatePath("/admin/requests");
  revalidatePath("/admin");
  revalidatePath("/admin/shifts", "layout");
  revalidatePath("/staff");
  const parts: string[] = [];
  if (removed > 0) parts.push(`終日休みのシフト ${removed} 件を削除`);
  if (changed > 0) parts.push(`時間変更 ${changed} 件をシフトへ反映`);
  return {
    ok: true,
    message: parts.length > 0 ? parts.join("・") + "しました。" : "対象のシフトはありませんでした。",
  };
}

// 申請そのものを削除（オーナー用）。テストや誤申請を一覧・カレンダーから完全に消す。
export async function deleteRequest(requestId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("time_off_requests").delete().eq("id", requestId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/requests");
  revalidatePath("/admin");
  revalidatePath("/admin/shifts", "layout");
  revalidatePath("/staff");
}
