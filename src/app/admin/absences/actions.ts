"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

const schema = z.object({
  staff_id: z.string().uuid("スタッフを選んでください"),
  absence_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を入力してください"),
  kind: z.enum(["absent", "no_show", "late", "early_leave"]),
  reason: z.string().trim().max(200).optional().or(z.literal("")),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  // 連絡を受けた日時（datetime-local）。無断欠勤なら空。
  reported_at: z.string().optional().or(z.literal("")),
});

// 欠勤・遅刻・早退を1件記録する。同じ日・同じ区分は上書き（登録し直しても増えない）。
export async function recordAbsence(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const me = await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("absences").upsert(
    {
      staff_id: d.staff_id,
      absence_date: d.absence_date,
      kind: d.kind,
      reason: d.reason ? d.reason : null,
      note: d.note ? d.note : null,
      // 無断欠勤は「連絡が無かった」ことが情報なので、日時を入れない
      reported_at: d.kind === "no_show" || !d.reported_at ? null : new Date(d.reported_at).toISOString(),
      created_by: me.id,
    },
    { onConflict: "staff_id,absence_date,kind" }
  );
  if (error) return { ok: false, message: `保存に失敗: ${error.message}` };

  revalidatePath("/admin/absences");
  return { ok: true, message: "記録しました。" };
}

export async function deleteAbsence(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("absences").delete().eq("id", id);
  if (error) return { ok: false, message: `削除に失敗: ${error.message}` };
  revalidatePath("/admin/absences");
  return { ok: true, message: "削除しました。" };
}
