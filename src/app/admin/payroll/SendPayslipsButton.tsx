"use client";

import { useState, useTransition } from "react";

// 給与明細PDFを全員分生成して各スタッフのLINEへ送るボタン。
export default function SendPayslipsButton({ month, count }: { month: string; count: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn-outline"
        style={{ fontSize: 12.5, padding: "7px 12px" }}
        disabled={pending || count === 0}
        onClick={() => {
          if (!confirm(`${count}名分の給与明細PDFを作成し、各自のLINEへリンクを送信します。よろしいですか？`)) return;
          start(async () => {
            try {
              const res = await fetch("/api/payroll/payslips", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month }),
              });
              const j = await res.json().catch(() => null);
              setMsg({ ok: !!j?.ok, text: j?.message ?? j?.error ?? "送信に失敗しました。" });
            } catch {
              setMsg({ ok: false, text: "通信に失敗しました。" });
            }
          });
        }}
      >
        {pending ? "送信中…" : "📨 明細PDFをLINE送信"}
      </button>
      {msg && (
        <span className="help" style={{ margin: 0, color: msg.ok ? "#3d6b4f" : "#9a3a30" }}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
