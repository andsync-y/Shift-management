// =====================================================================
// 店舗（テナント）の解決
// =====================================================================
// 通常のユーザー操作では、これを呼ぶ必要はない。
// DB側の DEFAULT が coalesce(current_store_id(), 既定店舗) になっているため、
// ログイン中ユーザーの INSERT には自動でその人の店舗が入る。
//
// 明示が要るのは次の2つ。
//   1. サービスロール（createAdminClient）で走る処理
//      auth.uid() が null なので current_store_id() も null になり、
//      DEFAULT が既定店舗にフォールバックしてしまう。
//   2. 新規スタッフ作成（profiles の INSERT）
//      その人の profiles 行がまだ無いため、自分の店舗を引けない。
//
// 対象箇所は docs/MULTI_TENANT.md のチェックリストにまとめてある。
// =====================================================================

import { createClient } from "@/lib/supabase/server";

/**
 * 既定店舗（全力ストレッチ岐阜長良店）のID。
 * 1店舗しか無い間のフォールバック先。2店舗目を入れる前に、
 * これに依存している箇所をすべて潰すこと。
 */
export const DEFAULT_STORE_ID = "00000000-0000-4000-8000-000000000001";

/**
 * ログイン中ユーザーの所属店舗IDを返す。
 * 未ログイン、またはプロフィールが無い場合は null。
 */
export async function getCurrentStoreId(): Promise<string | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("store_id")
    .eq("id", user.id)
    .maybeSingle();

  return (data?.store_id as string | undefined) ?? null;
}

/**
 * ログイン中ユーザーの所属店舗IDを返す。解決できなければ既定店舗を返す。
 *
 * サービスロールで走る処理から使う。1店舗の間はフォールバックで正しく動くが、
 * 2店舗目を入れる前に「どの店舗ぶんの処理か」を引数で受け取る形へ直すこと。
 */
export async function requireStoreId(): Promise<string> {
  return (await getCurrentStoreId()) ?? DEFAULT_STORE_ID;
}
