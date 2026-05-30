"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("メールアドレスまたはパスワードが正しくありません。");
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleLogin}>
        <div className="eyebrow accent">ZENRYOKU STRETCH · 岐阜長良</div>
        <div className="login-mark" style={{ marginTop: 14 }}>
          全力ストレッチ岐阜長良店
        </div>
        <h1 className="login-title en">Sign in</h1>
        <p className="login-sub">シフト管理システム</p>

        <div className="field" style={{ marginBottom: 22 }}>
          <label htmlFor="email">
            Email <span className="jp-label">／ メールアドレス</span>
          </label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            placeholder="you@example.com"
          />
        </div>

        <div className="field" style={{ marginBottom: 32 }}>
          <label htmlFor="password">
            Password <span className="jp-label">／ パスワード</span>
          </label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p style={{ color: "var(--accent-ink)", fontSize: 13, marginBottom: 16 }}>{error}</p>
        )}

        <button
          type="submit"
          className="btn-fill"
          style={{ width: "100%", justifyContent: "center" }}
          disabled={loading}
        >
          {loading ? "ログイン中..." : "ログイン"}
        </button>

        {process.env.NEXT_PUBLIC_LINE_LOGIN?.trim() === "1" && (
          <a
            href="/auth/line"
            className="btn-outline"
            style={{
              width: "100%",
              justifyContent: "center",
              marginTop: 12,
              background: "#06C755",
              borderColor: "#06C755",
              color: "#fff",
            }}
          >
            LINE でログイン
          </a>
        )}

        <p className="login-foot">アカウントは管理者が発行します</p>
      </form>
    </div>
  );
}
