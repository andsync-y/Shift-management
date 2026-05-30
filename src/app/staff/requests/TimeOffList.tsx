"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelTimeOff } from "./actions";
import {
  REQUEST_STATUS_LABELS_JA,
  type RequestStatus,
  type TimeOffRequest,
} from "@/lib/types";

const STATUS_STYLE: Record<RequestStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-gray-100 text-gray-500",
};

export default function TimeOffList({ requests }: { requests: TimeOffRequest[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function cancel(id: string) {
    startTransition(async () => {
      await cancelTimeOff(id);
      router.refresh();
    });
  }

  if (requests.length === 0) {
    return <p className="text-sm text-gray-400">申請履歴はありません。</p>;
  }

  return (
    <ul className="divide-y divide-gray-100">
      {requests.map((r) => (
        <li key={r.id} className="flex items-center justify-between py-2 text-sm">
          <div>
            <span className="font-medium">{r.off_date}</span>
            <span className="ml-2 text-gray-500">
              {r.start_time && r.end_time
                ? `${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}`
                : "終日"}
            </span>
            {r.reason && <span className="ml-2 text-gray-400">（{r.reason}）</span>}
          </div>
          <div className="flex items-center gap-3">
            <span className={`badge ${STATUS_STYLE[r.status as RequestStatus]}`}>
              {REQUEST_STATUS_LABELS_JA[r.status as RequestStatus]}
            </span>
            {r.status === "pending" && (
              <button
                onClick={() => cancel(r.id)}
                className="text-xs text-gray-400 hover:text-red-500"
                disabled={pending}
              >
                取消
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
