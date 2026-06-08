"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { loginIdToEmail } from "@/lib/login-id";

const schema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

type Result = { ok: boolean; message: string };

// 既存のメール＋パスワードで本人確認し、保留中の LINE userId を自分の profile に紐づける。
// 成功したらそのままログイン状態にして / へ。
export async function linkLineAccount(
  _prev: Result | null,
  formData: FormData
): Promise<Result> {
  const pending = (await cookies()).get("line_pending_id")?.value;
  if (!pending) return { ok: false, message: "連携セッションが切れました。最初からやり直してください。" };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "入力を確認してください。" };
  const { email, password } = parsed.data;

  // 通常ログイン（cookie にセッションが乗る）。
  // 入力はログインID（例 fukuda）でもメールでも可。loginIdToEmail で内部メールへ変換する。
  const supabase = await createClient();
  const { data: signin, error } = await supabase.auth.signInWithPassword({
    email: loginIdToEmail(email),
    password,
  });
  if (error || !signin.user) {
    return { ok: false, message: "ログインIDまたはパスワードが正しくありません。" };
  }

  // この LINE が既に別アカウントに使われていないか確認
  const admin = createAdminClient();
  const { data: taken } = await admin
    .from("profiles")
    .select("id")
    .eq("line_user_id", pending)
    .maybeSingle();
  if (taken && taken.id !== signin.user.id) {
    return { ok: false, message: "このLINEアカウントは既に別のスタッフに連携されています。" };
  }

  const { error: updErr } = await admin
    .from("profiles")
    .update({ line_user_id: pending })
    .eq("id", signin.user.id);
  if (updErr) return { ok: false, message: "連携の保存に失敗しました。" };

  (await cookies()).delete("line_pending_id");
  redirect("/");
}
