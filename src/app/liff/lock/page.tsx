"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// LINE内で開く入口スマートロック操作ページ（LIFF）。
// リッチメニューから ?action=lock / ?action=unlock で開くと、その動作を自動実行する。
// パラメータが無い場合は 解錠/施錠 ボタンを表示する。
// 必要な環境変数: NEXT_PUBLIC_LIFF_ID（打刻と共用）
//
// 権限: 連携済みの全スタッフが操作可。オーナーはどこからでも、
//       一般スタッフは店舗周辺のみ（判定はサーバー側 /api/lock/control）。

declare global {
  interface Window {
    liff?: {
      init: (c: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getIDToken: () => string | null;
      closeWindow: () => void;
    };
  }
}

type Status = "loading" | "ready" | "error";

export default function LiffLockPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; needLink?: boolean } | null>(null);
  const autoDone = useRef(false);

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const autoAction =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("action")
      : null;

  useEffect(() => {
    if (!liffId) {
      setStatus("error");
      setMsg("LIFF未設定です（NEXT_PUBLIC_LIFF_ID）。管理者にお問い合わせください。");
      return;
    }
    const s = document.createElement("script");
    s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    s.onload = async () => {
      try {
        await window.liff!.init({ liffId });
        if (!window.liff!.isLoggedIn()) {
          window.liff!.login();
          return;
        }
        setStatus("ready");
      } catch {
        setStatus("error");
        setMsg("LINEの初期化に失敗しました。LINEアプリ内から開いてください。");
      }
    };
    s.onerror = () => {
      setStatus("error");
      setMsg("LIFFの読み込みに失敗しました。通信環境を確認してください。");
    };
    document.body.appendChild(s);
  }, [liffId]);

  function getPosition(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  const operate = useCallback(async (action: "lock" | "unlock") => {
    setBusy(true);
    setResult(null);
    try {
      const idToken = window.liff?.getIDToken() ?? null;
      if (!idToken) {
        setResult({ ok: false, text: "認証情報が取得できませんでした。開き直してください。" });
        return;
      }
      const pos = await getPosition();
      const res = await fetch("/api/lock/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, action, lat: pos?.lat, lng: pos?.lng }),
      });
      const data = (await res.json()) as { ok: boolean; message: string; needLink?: boolean };
      setResult({ ok: data.ok, text: data.message, needLink: data.needLink });
    } catch {
      setResult({ ok: false, text: "通信に失敗しました。もう一度お試しください。" });
    } finally {
      setBusy(false);
    }
  }, []);

  // リッチメニューから ?action 付きで開かれたら自動で操作
  useEffect(() => {
    if (
      status === "ready" &&
      !autoDone.current &&
      (autoAction === "lock" || autoAction === "unlock")
    ) {
      autoDone.current = true;
      operate(autoAction);
    }
  }, [status, autoAction, operate]);

  // リッチメニュー経由で成功したら、結果を一瞬見せてから自動で画面を閉じる
  useEffect(() => {
    if (result?.ok && (autoAction === "lock" || autoAction === "unlock")) {
      const t = setTimeout(() => {
        try {
          window.liff?.closeWindow();
        } catch {
          /* closeWindow非対応時はそのまま */
        }
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [result, autoAction]);

  const label = autoAction === "lock" ? "施錠" : autoAction === "unlock" ? "解錠" : null;

  return (
    <div className="liff-wrap">
      <div className="liff-card">
        <div className="eyebrow accent" style={{ textAlign: "center" }}>SMART LOCK</div>
        <h1 className="liff-title">{label ? `入口${label}` : "入口スマートロック"}</h1>

        {status === "loading" && (
          <div className="route-loading" style={{ minHeight: 160 }}>
            <span className="spinner" />
            <span className="route-loading-text">準備中…</span>
          </div>
        )}

        {status === "error" && <p className="liff-msg err">{msg}</p>}

        {status === "ready" && (
          <>
            {busy && (
              <div className="route-loading" style={{ minHeight: 120 }}>
                <span className="spinner" />
                <span className="route-loading-text">{label ?? ""}しています…</span>
              </div>
            )}

            {!busy && result && (
              <p className={"liff-msg " + (result.ok ? "ok" : "err")}>{result.text}</p>
            )}

            {/* 未連携：その場で初回ひも付けへ誘導 */}
            {!busy && result?.needLink && (
              <a
                href="/auth/line"
                className="liff-btn in"
                style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: 18 }}
              >
                アカウントを連携する
              </a>
            )}

            {/* 手動表示、または自動操作が失敗した時のみボタンを出す（成功時は自動で閉じる） */}
            {!busy && !result?.needLink && (!autoAction || (result && !result.ok)) && (
              <>
                {!autoAction && !result && (
                  <p className="liff-help">店舗で「解錠（開場）」「施錠」を押してください。位置情報の確認があります。</p>
                )}
                <div className="liff-btns" style={{ marginTop: result ? 22 : 0 }}>
                  <button className="liff-btn in" onClick={() => operate("unlock")} disabled={busy}>
                    解錠（開場）
                  </button>
                  <button className="liff-btn out" onClick={() => operate("lock")} disabled={busy}>
                    施錠
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
