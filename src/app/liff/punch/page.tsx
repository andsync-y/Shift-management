"use client";

import { useEffect, useState } from "react";

// LINE内で開くワンタップ打刻ページ（LIFF）。
// 出勤/退勤ボタンを押すと、自動でGPSを取得して打刻APIへ送る。
// 必要な環境変数: NEXT_PUBLIC_LIFF_ID（LINEログインチャネルで発行したLIFF ID）

declare global {
  interface Window {
    liff?: {
      init: (c: { liffId: string }) => Promise<void>;
      isLoggedIn: () => boolean;
      login: () => void;
      getIDToken: () => string | null;
    };
  }
}

type Status = "loading" | "ready" | "error";

export default function LiffPunchPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

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

  async function punch(action: "in" | "out") {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const idToken = window.liff?.getIDToken() ?? null;
      if (!idToken) {
        setResult({ ok: false, text: "認証情報が取得できませんでした。開き直してください。" });
        return;
      }
      const pos = await getPosition();
      const res = await fetch("/api/timecard/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, action, lat: pos?.lat, lng: pos?.lng }),
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      setResult({ ok: data.ok, text: data.message });
    } catch {
      setResult({ ok: false, text: "通信に失敗しました。もう一度お試しください。" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="liff-wrap">
      <div className="liff-card">
        <div className="eyebrow accent" style={{ textAlign: "center" }}>TIME CARD</div>
        <h1 className="liff-title">勤怠打刻</h1>

        {status === "loading" && (
          <div className="route-loading" style={{ minHeight: 160 }}>
            <span className="spinner" />
            <span className="route-loading-text">準備中…</span>
          </div>
        )}

        {status === "error" && <p className="liff-msg err">{msg}</p>}

        {status === "ready" && (
          <>
            <p className="liff-help">店舗で「出勤」「退勤」を押してください。位置情報の確認があります。</p>
            <div className="liff-btns">
              <button className="liff-btn in" onClick={() => punch("in")} disabled={busy}>
                {busy ? "処理中…" : "出勤"}
              </button>
              <button className="liff-btn out" onClick={() => punch("out")} disabled={busy}>
                {busy ? "処理中…" : "退勤"}
              </button>
            </div>
            {result && <p className={"liff-msg " + (result.ok ? "ok" : "err")}>{result.text}</p>}
          </>
        )}
      </div>
    </div>
  );
}
