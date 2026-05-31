"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { pushLineMessage } from "@/lib/line";

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
    .select("staff_id, off_date, request_type")
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
  }

  // 承認/却下はカレンダー各所の表示にも影響するので、関連ページもまとめて再検証する
  revalidatePath("/admin/requests");
  revalidatePath("/admin");
  revalidatePath("/admin/shifts", "layout");
  revalidatePath("/staff");
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
