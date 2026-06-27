"use client";

import { useRef, useState } from "react";

// 店舗書類のアップロード（差し替え）。固定パスに upsert するので URL は不変。
export default function DocumentUploader({ type, label }: { type: "counseling" | "ticket"; label: string }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg({ ok: false, text: "ファイルを選んでください。" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("type", type);
      fd.append("file", file);
      const r = await fetch("/api/documents/upload", { method: "POST", body: fd });
      const j = await r.json();
      setMsg({ ok: !!j.ok, text: j.ok ? "アップロードしました。" : `失敗: ${j.error ?? "不明なエラー"}` });
      if (j.ok && fileRef.current) fileRef.current.value = "";
    } catch {
      setMsg({ ok: false, text: "通信に失敗しました。" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="section" style={{ marginBottom: 16 }}>
      <div className="section-head">
        <h2>{label}</h2>
        <a
          className="eyebrow"
          href={`/kiosk/doc/${type}`}
          target="_blank"
          rel="noreferrer"
          style={{ textDecoration: "none" }}
        >
          プレビュー →
        </a>
      </div>
      <div className="section-body" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" className="input" style={{ maxWidth: 320 }} />
        <button className="btn-fill" onClick={upload} disabled={busy}>
          {busy ? "アップロード中…" : "アップロード（差し替え）"}
        </button>
        {msg && (
          <span className="help" style={{ margin: 0, color: msg.ok ? "#3d6b4f" : "#9a3a30" }}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
