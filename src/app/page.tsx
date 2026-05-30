import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// ロールに応じて適切なダッシュボードへ振り分けるエントリーポイント
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "super_admin") {
    redirect("/admin");
  }
  redirect("/staff");
}
