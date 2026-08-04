"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cleanupApprovedOffShifts } from "./actions";

// 承認済みの終日休みに残っているシフトを一括削除するメンテ用ボタン。
export default function CleanupShiftsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    if (!confirm("承認済みの「終日休み」に対応する本人のシフトを一括削除します。よろしいですか？")) return;
    setBusy(true);
    try {
      const r = await cleanupApprovedOffShifts();
      alert(r.message);
      router.refresh();
    } catch {
      alert("処理に失敗しました。ページを再読み込みしてからお試しください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn-outline" onClick={run} disabled={busy} style={{ fontSize: 12.5 }}>
      {busy ? "処理中…" : "承認済みの休みでシフトを掃除"}
    </button>
  );
}
