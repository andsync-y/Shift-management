"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const createStaffSchema = z.object({
  email: z.string().email("メールアドレスの形式が正しくありません"),
  password: z.string().min(8, "パスワードは8文字以上にしてください"),
  full_name: z.string().min(1, "氏名を入力してください"),
  role: z.enum(["super_admin", "staff"]),
  employment_type: z.enum(["full_time", "part_time"]),
  phone: z.string().optional(),
  hourly_wage: z.coerce.number().int().nonnegative().optional(),
  min_hours_per_week: z.coerce.number().int().nonnegative().default(0),
  max_hours_per_week: z.coerce.number().int().positive().default(40),
  display_color: z.string().default("#e8380d"),
});

export type ActionResult = { ok: boolean; message: string };

export async function createStaff(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = createStaffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const input = parsed.data;

  const admin = createAdminClient();

  // 1) auth ユーザー作成（メール確認はスキップして即利用可に）
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name, role: input.role },
  });

  if (authError || !created.user) {
    return { ok: false, message: `アカウント作成に失敗: ${authError?.message ?? "不明なエラー"}` };
  }

  // 2) profiles を upsert（トリガーで作成済みの行を上書き）
  const { error: profileError } = await admin.from("profiles").upsert({
    id: created.user.id,
    full_name: input.full_name,
    role: input.role,
    employment_type: input.employment_type,
    phone: input.phone || null,
    hourly_wage: input.hourly_wage ?? null,
    min_hours_per_week: input.min_hours_per_week,
    max_hours_per_week: input.max_hours_per_week,
    display_color: input.display_color,
  });

  if (profileError) {
    return { ok: false, message: `プロフィール保存に失敗: ${profileError.message}` };
  }

  revalidatePath("/admin/staff");
  return { ok: true, message: `${input.full_name} さんを登録しました。` };
}

export async function toggleStaffActive(staffId: string, isActive: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("profiles").update({ is_active: isActive }).eq("id", staffId);
  revalidatePath("/admin/staff");
}
