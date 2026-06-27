"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

// 受付タブレットから店舗書類を表示し「印刷」する。
// Android Chrome は PDF を iframe 表示できないため、PDF.js でページ内に描画してから window.print()。
// 画像（PNG/JPG）はそのまま表示。シフト表印刷と同じ「開く→印刷」の使用感。

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 6mm; }
  body { background: #fff; }
  .no-print { display: none !important; }
  .kdoc-page { width: 100% !important; max-width: none !important; height: auto !important;
    margin: 0 !important; box-shadow: none !important; }
  /* 最後のページには改ページを入れない（空白の余分ページを防ぐ） */
  .kdoc-page:not(:last-child) { page-break-after: always; }
}
.kdoc-page { display: block; width: 100%; max-width: 820px; height: auto;
  margin: 0 auto 14px; box-shadow: 0 1px 8px rgba(0,0,0,.18); background: #fff; }
`;

type Status = "loading" | "ready" | "notoken" | "empty" | "error";

export default function KioskDocPage() {
  const params = useParams<{ type: string }>();
  const type = params?.type === "ticket" ? "ticket" : "counseling";
  const title = type === "ticket" ? "回数券 規約" : "カウンセリングシート";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("kiosk_token") : null;
    if (!token) {
      setStatus("notoken");
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/kiosk/doc?token=${encodeURIComponent(token)}&type=${type}`, { cache: "no-store" });
        if (res.status === 404) return setStatus("empty");
        if (!res.ok) return setStatus("error");
        const ctype = res.headers.get("Content-Type") || "";
        const blob = await res.blob();
        if (cancelled) return;
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";

        if (ctype.startsWith("image/")) {
          const img = document.createElement("img");
          img.src = URL.createObjectURL(blob);
          img.className = "kdoc-page";
          img.alt = title;
          container.appendChild(img);
          setStatus("ready");
          return;
        }

        // PDF → PDF.js で各ページを canvas に描画
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        const buf = await blob.arrayBuffer();
        if (cancelled) return;
        const pdf = await pdfjs.getDocument({ data: buf }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(3, 1240 / base.width); // 約150dpi（A4幅）相当
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.className = "kdoc-page";
          const ctx = canvas.getContext("2d");
          if (ctx) await page.render({ canvasContext: ctx, viewport }).promise;
          container.appendChild(canvas);
        }
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [type, title]);

  return (
    <div className="kdoc">
      <style>{PRINT_CSS}</style>
      <div className="kdoc-bar no-print">
        <a href="/kiosk" className="btn-outline">← 戻る</a>
        <strong style={{ fontSize: 15 }}>{title}</strong>
        <button className="btn-fill" onClick={() => window.print()} disabled={status !== "ready"}>
          🖨 印刷
        </button>
        <span className="help" style={{ margin: 0 }}>
          {status === "loading"
            ? "読み込み中…"
            : status === "ready"
            ? "Brother iPrint&Scan 等で印刷"
            : ""}
        </span>
      </div>

      {status === "notoken" ? (
        <div className="kdoc-empty">
          このタブレットは未設定です。設定用URL（<span className="en">/kiosk?token=…</span>）で開いてください。
        </div>
      ) : status === "empty" ? (
        <div className="kdoc-empty">
          まだ{title}が登録されていません。管理画面「店舗書類」からアップロードしてください。
        </div>
      ) : status === "error" ? (
        <div className="kdoc-empty">読み込みに失敗しました。通信状況を確認して再読み込みしてください。</div>
      ) : (
        <>
          {status === "loading" && <div className="kdoc-empty">読み込み中…</div>}
          {/* このコンテナは ref で手動描画するため、React の子要素は置かない（競合防止） */}
          <div className="kdoc-pages" ref={containerRef} style={{ padding: "16px 12px 28px" }} />
        </>
      )}
    </div>
  );
}
