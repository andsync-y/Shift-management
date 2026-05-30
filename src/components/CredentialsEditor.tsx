"use client";

import { useActionState } from "react";
import { updateCredentials, type ActionResult } from "@/app/admin/staff/actions";

export default function CredentialsEditor({
  staffId,
  currentEmail,
  currentPassword,
}: {
  staffId: string;
  currentEmail: string | null;
  currentPassword: string | null;
}) {
  const action = updateCredentials.bind(null, staffId);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    action,
    null
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">ログインID（メール）</label>
          <input
            name="email"
            type="email"
            className="input"
            defaultValue={currentEmail ?? ""}
            placeholder="staff@example.com"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="label">新しいパスワード</label>
          <input
            name="password"
            type="text"
            className="input font-mono"
            defaultValue={currentPassword ?? ""}
            placeholder="8文字以上"
            autoComplete="new-password"
          />
          <p className="mt-1 text-[11px] text-gray-400">
            空欄のままだとパスワードは変更しません。
          </p>
        </div>
      </div>

      {state && (
        <p className={`text-sm ${state.ok ? "text-green-600" : "text-red-600"}`}>
          {state.message}
        </p>
      )}

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "更新中..." : "ログイン情報を更新"}
      </button>
    </form>
  );
}
