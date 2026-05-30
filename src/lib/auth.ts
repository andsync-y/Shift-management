import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

// ログイン済みユーザーのプロフィールを取得。未ログインなら /login へ。
export async function requireUser(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  return profile as Profile;
}

// super_admin 専用ページのガード
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireUser();
  if (profile.role !== "super_admin") redirect("/staff");
  return profile;
}
