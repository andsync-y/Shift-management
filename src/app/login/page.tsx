"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loginIdToEmail } from "@/lib/login-id";

const REMEMBER_KEY = "shift.rememberedLoginId";

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberId, setRememberId] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 保存済みのログインIDがあれば初期表示する
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setLoginId(saved);
      setRememberId(true);
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: loginIdToEmail(loginId),
      password,
    });

    if (error) {
      setError("ログインIDまたはパスワードが正しくありません。");
      setLoading(false);
      return;
    }
    // チェック時のみログインIDを記憶（パスワードは保存しない）
    if (rememberId) {
      localStorage.setItem(REMEMBER_KEY, loginId);
    } else {
      localStorage.removeItem(REMEMBER_KEY);
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
          <label htmlFor="loginId">
            Login ID <span className="jp-label">／ ログインID</span>
          </label>
          <input
            id="loginId"
            type="text"
            className="input"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="例: fukuda"
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

        <label
          htmlFor="rememberId"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 24,
            fontSize: 14,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            id="rememberId"
            type="checkbox"
            checked={rememberId}
            onChange={(e) => setRememberId(e.target.checked)}
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          ログインIDを記憶する
        </label>

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
