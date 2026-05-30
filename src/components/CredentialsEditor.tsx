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
    <form action={formAction}>
      <div className="form-grid" style={{ margin: "0 0 26px" }}>
        <div className="field">
          <label>
            Login ID <span className="jp-label">／ ログインID（メール）</span>
          </label>
          <input
            name="email"
            type="email"
            className="input"
            defaultValue={currentEmail ?? ""}
            placeholder="staff@example.com"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label>
            New password <span className="jp-label">／ 新しいパスワード</span>
          </label>
          <input
            name="password"
            type="text"
            className="input mono"
            defaultValue={currentPassword ?? ""}
            placeholder="8文字以上"
            autoComplete="new-password"
          />
          <p className="help" style={{ marginTop: 2 }}>
            空欄のままだとパスワードは変更しません。
          </p>
        </div>
      </div>

      {state && (
        <p
          style={{
            fontSize: 13,
            marginBottom: 16,
            color: state.ok ? "#3d6b4f" : "var(--accent-ink)",
          }}
        >
          {state.message}
        </p>
      )}

      <button type="submit" className="btn-fill" disabled={pending}>
        {pending ? "更新中..." : "ログイン情報を更新"}
      </button>
    </form>
  );
}
