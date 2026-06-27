"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

// 受付タブレットから店舗書類を全画面表示し、「印刷」ボタンで印刷する（シフト表印刷と同じ使用感）。
export default function KioskDocPage() {
  const params = useParams<{ type: string }>();
  const type = params?.type === "ticket" ? "ticket" : "counseling";
  const title = type === "ticket" ? "回数券 規約" : "カウンセリングシート";
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    setToken(typeof localStorage !== "undefined" ? localStorage.getItem("kiosk_token") : null);
    setReady(true);
  }, []);

  const src = token ? `/api/kiosk/doc?token=${encodeURIComponent(token)}&type=${type}` : "";

  const print = () => {
    const w = iframeRef.current?.contentWindow;
    try {
      w?.focus();
      w?.print();
    } catch {
      if (src) window.open(src, "_blank");
    }
  };

  return (
    <div className="kdoc">
      <div className="kdoc-bar no-print">
        <a href="/kiosk" className="btn-outline">← 戻る</a>
        <strong style={{ fontSize: 15 }}>{title}</strong>
        <button className="btn-fill" onClick={print} disabled={!token}>🖨 印刷</button>
        <span className="help" style={{ margin: 0 }}>Brother iPrint&amp;Scan 等で印刷</span>
      </div>
      {ready && !token ? (
        <div className="kdoc-empty">
          このタブレットは未設定です。設定用URL（<span className="en">/kiosk?token=…</span>）で開いてください。
        </div>
      ) : (
        <iframe ref={iframeRef} src={src} className="kdoc-frame" title={title} />
      )}
    </div>
  );
}
