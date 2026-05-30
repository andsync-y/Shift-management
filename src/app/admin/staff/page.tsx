import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  EMPLOYMENT_LABELS_JA,
  ROLE_LABELS_JA,
  type Profile,
} from "@/lib/types";
import StaffForm from "./StaffForm";

export default async function StaffPage() {
  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });

  // ログインID(メール)は auth 側にあるため、admin API でまとめて取得
  const emailById = new Map<string, string>();
  try {
    const admin = createAdminClient();
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of list?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email);
    }
  } catch {
    // service role 未設定などの場合はメール非表示で続行
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">スタッフ管理</h1>

      <details className="card group">
        <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
          <span>＋ 新規スタッフ登録</span>
          <span className="text-sm font-normal text-gray-400 group-open:hidden">
            開く
          </span>
          <span className="hidden text-sm font-normal text-gray-400 group-open:inline">
            閉じる
          </span>
        </summary>
        <div className="mt-4 border-t border-gray-100 pt-4">
          <StaffForm />
        </div>
      </details>

      <div className="card">
        <h2 className="mb-4 font-semibold">登録済みスタッフ（{staff?.length ?? 0}名）</h2>
        <p className="mb-3 text-xs text-gray-400">
          ※ ログインID・初期パスワードは本人へ配布用です。本人がパスワードを変更しても、ここの初期PW表示は変わりません。
        </p>

        {/* スマホ: カード表示 */}
        <div className="space-y-3 sm:hidden">
          {(staff as Profile[] | null)?.map((s) => (
            <div key={s.id} className="rounded-md border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 font-medium">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: s.display_color }}
                  />
                  {s.full_name}
                </span>
                <Link href={`/admin/staff/${s.id}`} className="text-sm text-brand hover:underline">
                  編集
                </Link>
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-gray-400">権限</dt>
                <dd>{ROLE_LABELS_JA[s.role]}（{EMPLOYMENT_LABELS_JA[s.employment_type]}）</dd>
                <dt className="text-gray-400">ログインID</dt>
                <dd className="break-all font-mono">{emailById.get(s.id) ?? "—"}</dd>
                <dt className="text-gray-400">初期PW</dt>
                <dd className="font-mono">{s.initial_password ?? "—"}</dd>
                <dt className="text-gray-400">週時間</dt>
                <dd>{s.min_hours_per_week} / {s.max_hours_per_week}h</dd>
                <dt className="text-gray-400">状態</dt>
                <dd>
                  {s.is_active ? (
                    <span className="badge bg-green-100 text-green-700">稼働中</span>
                  ) : (
                    <span className="badge bg-gray-100 text-gray-500">停止</span>
                  )}
                </dd>
              </dl>
            </div>
          ))}
          {(!staff || staff.length === 0) && (
            <p className="py-4 text-center text-gray-400">まだスタッフが登録されていません。</p>
          )}
        </div>

        {/* PC: テーブル表示 */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">氏名</th>
                <th className="py-2 pr-4">権限</th>
                <th className="py-2 pr-4">ログインID</th>
                <th className="py-2 pr-4">初期PW</th>
                <th className="py-2 pr-4">雇用形態</th>
                <th className="py-2 pr-4">週時間</th>
                <th className="py-2 pr-4">状態</th>
                <th className="py-2 pr-4">希望シフト</th>
              </tr>
            </thead>
            <tbody>
              {(staff as Profile[] | null)?.map((s) => (
                <tr key={s.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: s.display_color }}
                      />
                      {s.full_name}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{ROLE_LABELS_JA[s.role]}</td>
                  <td className="py-2 pr-4">
                    <span className="font-mono text-xs">{emailById.get(s.id) ?? "—"}</span>
                  </td>
                  <td className="py-2 pr-4">
                    <span className="font-mono text-xs">{s.initial_password ?? "—"}</span>
                  </td>
                  <td className="py-2 pr-4">{EMPLOYMENT_LABELS_JA[s.employment_type]}</td>
                  <td className="py-2 pr-4">
                    {s.min_hours_per_week} / {s.max_hours_per_week}h
                  </td>
                  <td className="py-2 pr-4">
                    {s.is_active ? (
                      <span className="badge bg-green-100 text-green-700">稼働中</span>
                    ) : (
                      <span className="badge bg-gray-100 text-gray-500">停止</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <Link href={`/admin/staff/${s.id}`} className="text-brand hover:underline">
                      編集
                    </Link>
                  </td>
                </tr>
              ))}
              {(!staff || staff.length === 0) && (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-gray-400">
                    まだスタッフが登録されていません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
