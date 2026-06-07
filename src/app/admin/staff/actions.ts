"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { loginIdToEmail, isValidLoginId } from "@/lib/login-id";

const createStaffSchema = z.object({
  email: z
    .string()
    .trim()
    .refine(isValidLoginId, "ログインIDは半角英数字（. _ -）またはメール形式で入力してください"),
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
    email: loginIdToEmail(input.email),
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
    initial_password: input.password,
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

// 雇用形態・電話・時給・週時間の更新（オーナー専用）
const profileSchema = z.object({
  employment_type: z.enum(["full_time", "part_time"]),
  phone: z.string().trim().optional().or(z.literal("")),
  hourly_wage: z.coerce.number().int().nonnegative().optional().or(z.literal("")),
  min_hours_per_week: z.coerce.number().int().nonnegative(),
  max_hours_per_week: z.coerce.number().int().positive(),
});

export async function updateStaffProfile(
  staffId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const d = parsed.data;
  if (d.max_hours_per_week < d.min_hours_per_week) {
    return { ok: false, message: "最大時間は最低時間以上にしてください。" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      employment_type: d.employment_type,
      phone: d.phone ? d.phone : null,
      hourly_wage: d.hourly_wage === "" || d.hourly_wage === undefined ? null : d.hourly_wage,
      min_hours_per_week: d.min_hours_per_week,
      max_hours_per_week: d.max_hours_per_week,
    })
    .eq("id", staffId);
  if (error) return { ok: false, message: `更新に失敗: ${error.message}` };

  revalidatePath(`/admin/staff/${staffId}`);
  revalidatePath("/admin/staff");
  return { ok: true, message: "プロフィールを更新しました。" };
}

const credentialsSchema = z
  .object({
    email: z
      .string()
      .trim()
      .refine((v) => v === "" || isValidLoginId(v), "ログインIDの形式が正しくありません")
      .optional()
      .or(z.literal("")),
    password: z
      .string()
      .min(8, "パスワードは8文字以上にしてください")
      .optional()
      .or(z.literal("")),
  })
  .refine((d) => d.email || d.password, {
    message: "ログインIDかパスワードのどちらかを入力してください",
  });

// スタッフのログインID(メール)・パスワードを更新（オーナーのみ）
export async function updateCredentials(
  staffId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = credentialsSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const { email, password } = parsed.data;

  const admin = createAdminClient();

  // auth 側のメール/パスワードを更新
  const attrs: { email?: string; password?: string } = {};
  if (email) attrs.email = loginIdToEmail(email);
  if (password) attrs.password = password;
  const { error: authError } = await admin.auth.admin.updateUserById(staffId, attrs);
  if (authError) {
    return { ok: false, message: `更新に失敗: ${authError.message}` };
  }

  // パスワードを変更したら配布用の初期PW表示も更新
  if (password) {
    await admin.from("profiles").update({ initial_password: password }).eq("id", staffId);
  }

  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${staffId}`);
  const what = [email && "ログインID", password && "パスワード"].filter(Boolean).join("・");
  return { ok: true, message: `${what}を更新しました。` };
}
