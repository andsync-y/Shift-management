"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewRequest } from "./actions";
import type { RequestStatus } from "@/lib/types";

// 承認/却下/変更ボタン（テーブル行・モバイルカード共用）
export default function RequestActions({
  id,
  status,
}: {
  id: string;
  status: RequestStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function act(next: "approved" | "rejected") {
    startTransition(async () => {
      await reviewRequest(id, next);
      router.refresh();
    });
  }

  if (status === "pending") {
    return (
      <span style={{ display: "inline-flex", gap: 16, alignItems: "center" }}>
        <button className="btn-link" onClick={() => act("approved")} disabled={pending}>
          承認
        </button>
        <button className="btn-link ink" onClick={() => act("rejected")} disabled={pending}>
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
      disabled={pending}
    >
      {status === "approved" ? "承認を取消" : "承認する"}
    </button>
  );
}
