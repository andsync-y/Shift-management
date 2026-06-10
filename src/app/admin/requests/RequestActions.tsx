"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewRequest, deleteRequest } from "./actions";
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

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch {
      // サーバーアクションが失敗（古いタブのキャッシュ等）したら気づけるように
      alert("更新に失敗しました。ページを再読み込み（更新）してから、もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  const del = () => {
    if (confirm("この申請を削除します。よろしいですか？")) run(() => deleteRequest(id));
  };

  if (status === "pending") {
    return (
      <span style={{ display: "inline-flex", gap: 16, alignItems: "center" }}>
        <button className="btn-link" onClick={() => run(() => reviewRequest(id, "approved"))} disabled={busy}>
          {busy ? "処理中…" : "承認"}
        </button>
        <button className="btn-link ink" onClick={() => run(() => reviewRequest(id, "rejected"))} disabled={busy}>
          却下
        </button>
        <button className="btn-link ink" onClick={del} disabled={busy} title="申請を削除">
          削除
        </button>
      </span>
    );
  }
  // すでに承認/却下済み：反対状態への切替（誤承認の取消）＋ 完全削除
  return (
    <span style={{ display: "inline-flex", gap: 16, alignItems: "center" }}>
      <button
        className="btn-link ink"
        onClick={() => run(() => reviewRequest(id, status === "approved" ? "rejected" : "approved"))}
        disabled={busy}
      >
        {busy ? "処理中…" : status === "approved" ? "承認を取消" : "承認する"}
      </button>
      <button className="btn-link ink" onClick={del} disabled={busy} title="申請を削除">
        削除
      </button>
    </span>
  );
}
