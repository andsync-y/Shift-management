"use client";

import { useActionState } from "react";
import { linkLineAccount } from "./actions";

export default function LinkLineForm() {
  const [state, formAction, pending] = useActionState(linkLineAccount, null);

  return (
    <form action={formAction} className="space-y-4" style={{ marginTop: 20 }}>
      <div className="field" style={{ marginBottom: 18 }}>
        <label htmlFor="email">
          ログインID <span className="jp-label">／ 登録メール</span>
        </label>
        <input id="email" name="email" type="email" className="input" required autoComplete="username" />
      </div>
      <div className="field" style={{ marginBottom: 24 }}>
        <label htmlFor="password">
          パスワード <span className="jp-label">／ Password</span>
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          required
          autoComplete="current-password"
        />
      </div>

      {state && !state.ok && (
        <p style={{ color: "var(--accent-ink)", fontSize: 13, marginBottom: 14 }}>{state.message}</p>
      )}

      <button
        type="submit"
        className="btn-fill"
        style={{ width: "100%", justifyContent: "center" }}
        disabled={pending}
      >
        {pending ? "連携中..." : "このLINEを連携する"}
      </button>
    </form>
  );
}
