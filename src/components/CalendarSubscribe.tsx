"use client";

import { useState } from "react";

// 自分の確定シフトを Google/Apple/Outlook カレンダーに購読登録するための案内。
export default function CalendarSubscribe({ token }: { token: string | null }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!token) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/api/ics/${token}`;
  // Googleカレンダーの「URLで追加」画面に直接飛ばす
  const googleUrl = `https://calendar.google.com/calendar/u/0/r/settings/addbyurl?cid=${encodeURIComponent(
    url
  )}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard 不可環境では手動コピー */
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <button className="btn-outline" onClick={() => setOpen((o) => !o)}>
        📅 カレンダーに追加 <span className="arrow">{open ? "↗" : "↘"}</span>
      </button>

      {open && (
        <div
          style={{
            marginTop: 14,
            padding: "16px 18px",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            background: "#fff",
          }}
        >
          <p className="help" style={{ marginTop: 0, marginBottom: 14 }}>
            下のURLをお使いのカレンダーアプリに「URLで追加（購読）」すると、確定したシフトが自動で反映されます（公開後のシフトのみ）。
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input className="input mono" readOnly value={url} style={{ flex: 1, minWidth: 220, fontSize: 12 }} />
            <button className="btn-fill" onClick={copy} style={{ padding: "11px 18px" }}>
              {copied ? "コピーしました" : "URLをコピー"}
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            <a className="btn-link" href={googleUrl} target="_blank" rel="noopener noreferrer">
              Googleカレンダーで開く <span className="arrow">↗</span>
            </a>
          </div>

          <p className="help" style={{ marginTop: 14 }}>
            ※ Apple/Outlook の場合は「照会カレンダー / 購読」にこのURLを貼り付けてください。URLは個人用のため共有しないでください。
          </p>
        </div>
      )}
    </div>
  );
}
