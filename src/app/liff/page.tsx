"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// LINE内で開く統合操作ページ（LIFF）。
// リッチメニューから ?action=in / out / unlock / lock で開くと、その動作を自動実行する。
//   in / out      → 出勤 / 退勤（/api/timecard/punch）
//   unlock / lock → 解錠 / 施錠（/api/lock/control）
// 必要な環境変数: NEXT_PUBLIC_LIFF_ID
//
// 設計意図: LIFFのエンドポイントURLをこのページ（/liff）に固定し、ボタンは
// 「パスなし・クエリだけ」で開く。パス連結に依存しないため、ルートが /login へ
// 飛ぶ構成でも誤ってログイン画面に落ちない（壊れにくい）。

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
type Action = "in" | "out" | "unlock" | "lock";

const ACTIONS: Record<
  Action,
  { api: string; verb: string; eyebrow: string; title: string; kind: "punch" | "lock" }
> = {
  in: { api: "/api/timecard/punch", verb: "出勤", eyebrow: "TIME CARD", title: "出勤打刻", kind: "punch" },
  out: { api: "/api/timecard/punch", verb: "退勤", eyebrow: "TIME CARD", title: "退勤打刻", kind: "punch" },
  unlock: { api: "/api/lock/control", verb: "解錠", eyebrow: "SMART LOCK", title: "入口解錠", kind: "lock" },
  lock: { api: "/api/lock/control", verb: "施錠", eyebrow: "SMART LOCK", title: "入口施錠", kind: "lock" },
};

function isAction(v: string | null): v is Action {
  return v === "in" || v === "out" || v === "unlock" || v === "lock";
}

export default function LiffPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; needLink?: boolean } | null>(null);
  const autoDone = useRef(false);

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const rawAction =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("action") : null;
  const action: Action | null = isAction(rawAction) ? rawAction : null;
  const cfg = action ? ACTIONS[action] : null;

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

  const run = useCallback(async (act: Action) => {
    setBusy(true);
    setResult(null);
    try {
      const idToken = window.liff?.getIDToken() ?? null;
      if (!idToken) {
        setResult({ ok: false, text: "認証情報が取得できませんでした。開き直してください。" });
        return;
      }
      const pos = await getPosition();
      const res = await fetch(ACTIONS[act].api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, action: act, lat: pos?.lat, lng: pos?.lng }),
      });
      const data = (await res.json()) as { ok: boolean; message: string; needLink?: boolean };
      setResult({ ok: data.ok, text: data.message, needLink: data.needLink });
    } catch {
      setResult({ ok: false, text: "通信に失敗しました。もう一度お試しください。" });
    } finally {
      setBusy(false);
    }
  }, []);

  // リッチメニューから ?action 付きで開かれたら自動実行
  useEffect(() => {
    if (status === "ready" && !autoDone.current && action) {
      autoDone.current = true;
      run(action);
    }
  }, [status, action, run]);

  // 自動実行が成功したら、結果を一瞬見せてから自動で画面を閉じる
  useEffect(() => {
    if (result?.ok && action) {
      const t = setTimeout(() => {
        try {
          window.liff?.closeWindow();
        } catch {
          /* closeWindow非対応時はそのまま */
        }
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [result, action]);

  return (
    <div className="liff-wrap">
      <div className="liff-card">
        <div className="eyebrow accent" style={{ textAlign: "center" }}>{cfg?.eyebrow ?? "MENU"}</div>
        <h1 className="liff-title">{cfg?.title ?? "メニュー"}</h1>

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
                <span className="route-loading-text">{cfg ? `${cfg.verb}しています…` : "処理中…"}</span>
              </div>
            )}

            {!busy && result && <p className={"liff-msg " + (result.ok ? "ok" : "err")}>{result.text}</p>}

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
            {!busy && !result?.needLink && (!action || (result && !result.ok)) && (
              <>
                {!action && !result && (
                  <p className="liff-help">操作を選んでください。位置情報の確認があります。</p>
                )}
                <div className="liff-btns" style={{ marginTop: result ? 22 : 0 }}>
                  <button className="liff-btn in" onClick={() => run("in")} disabled={busy}>
                    出勤
                  </button>
                  <button className="liff-btn out" onClick={() => run("out")} disabled={busy}>
                    退勤
                  </button>
                </div>
                <div className="liff-btns" style={{ marginTop: 12 }}>
                  <button className="liff-btn in" onClick={() => run("unlock")} disabled={busy}>
                    解錠（開場）
                  </button>
                  <button className="liff-btn out" onClick={() => run("lock")} disabled={busy}>
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
