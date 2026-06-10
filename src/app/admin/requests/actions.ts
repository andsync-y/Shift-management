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
      // 終日休みの承認時: 本人のその日のシフトを削除（不要な出勤予定を消す）
      const isAllDayOff =
        updated.request_type === "off" && !updated.start_time && !updated.end_time;
      if (isAllDayOff) {
        await supabase
          .from("shifts")
          .delete()
          .eq("staff_id", updated.staff_id)
          .eq("work_date", updated.off_date);
      }

      // 人員が不足していれば他スタッフへ自動で出勤打診を開始する。
      await startOfferForApprovedRequest(createAdminClient(), {
        id: updated.id,
        staff_id: updated.staff_id,
        off_date: updated.off_date,
        request_type: updated.request_type,
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
    .select("staff_id, off_date, start_time, end_time")
    .eq("request_type", "off")
    .eq("status", "approved");
  if (error) return { ok: false, message: error.message };

  // 終日休み（時間指定なし）のみ対象
  const allDay = (offs ?? []).filter((o) => !o.start_time && !o.end_time);
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

  revalidatePath("/admin/requests");
  revalidatePath("/admin");
  revalidatePath("/admin/shifts", "layout");
  revalidatePath("/staff");
  return {
    ok: true,
    message:
      removed > 0
        ? `承認済みの終日休みに対応するシフト ${removed} 件を削除しました。`
        : "削除対象のシフトはありませんでした。",
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
