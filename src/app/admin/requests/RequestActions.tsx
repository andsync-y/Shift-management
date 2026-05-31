"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewRequest } from "./actions";
import type { RequestStatus } from "@/lib/types";

// 承認/却下/取消ボタン（テーブル行・モバイルカード共用）
export default function RequestActions({
  id,
  status,
}: {
  id: string;
  status: RequestStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(next: "approved" | "rejected") {
    if (busy) return;
    setBusy(true);
    try {
      await reviewRequest(id, next);
      router.refresh();
    } catch {
      // サーバーアクションが失敗（古いタブのキャッシュ等）したら気づけるように
      alert("更新に失敗しました。ページを再読み込み（更新）してから、もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  if (status === "pending") {
    return (
      <span style={{ display: "inline-flex", gap: 16, alignItems: "center" }}>
        <button className="btn-link" onClick={() => act("approved")} disabled={busy}>
          {busy ? "処理中…" : "承認"}
        </button>
        <button className="btn-link ink" onClick={() => act("rejected")} disabled={busy}>
          却下
        </button>
      </span>
    );
  }
  // すでに承認/却下済み：反対の状態へ切り替えられる（誤承認の取り消し用）
  return (
    <button
      className="btn-link ink"
      onClick={() => act(status === "approved" ? "rejected" : "approved")}
      disabled={busy}
    >
      {busy ? "処理中…" : status === "approved" ? "承認を取消" : "承認する"}
    </button>
  );
}
