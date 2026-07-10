"use client";

import { useState, useTransition } from "react";
import { approveAllPending } from "./actions";

// 未対応の休み希望をまとめて承認するボタン（絞り込み中の月があればその月だけ）。
export default function ApproveAllButton({ month, count }: { month: string; count: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (count === 0 && !msg) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {count > 0 && (
        <button
          className="btn-fill"
          style={{ fontSize: 12, padding: "6px 12px" }}
          disabled={pending}
          onClick={() => {
            if (
              !confirm(
                `未対応の${count}件をすべて承認します。\n承認すると各申請者へLINE通知が送られ、終日休みの日の本人シフトは削除されます（欠員が出た枠は自動で出勤打診）。よろしいですか？`
              )
            )
              return;
            start(async () => {
              const r = await approveAllPending(month);
              setMsg(r.message);
            });
          }}
        >
          {pending ? "承認中…" : `すべて承認（${count}件）`}
        </button>
      )}
      {msg && <span className="help" style={{ margin: 0 }}>{msg}</span>}
    </span>
  );
}
