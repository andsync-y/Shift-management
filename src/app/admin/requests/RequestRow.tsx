"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewRequest } from "./actions";
import { REQUEST_STATUS_LABELS_JA, type RequestStatus } from "@/lib/types";

const STATUS_STYLE: Record<RequestStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-gray-100 text-gray-500",
};

export default function RequestRow({
  id,
  staffName,
  offDate,
  timeRange,
  reason,
  status,
}: {
  id: string;
  staffName: string;
  offDate: string;
  timeRange: string;
  reason: string;
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

  return (
    <tr className="border-b border-gray-100">
      <td className="py-2 pr-4">{staffName}</td>
      <td className="py-2 pr-4">{offDate}</td>
      <td className="py-2 pr-4">{timeRange}</td>
      <td className="py-2 pr-4 text-gray-600">{reason || "—"}</td>
      <td className="py-2 pr-4">
        <span className={`badge ${STATUS_STYLE[status]}`}>
          {REQUEST_STATUS_LABELS_JA[status]}
        </span>
      </td>
      <td className="py-2 pr-4">
        {status === "pending" ? (
          <div className="flex gap-2">
            <button onClick={() => act("approved")} className="btn-primary py-1 text-xs" disabled={pending}>
              承認
            </button>
            <button onClick={() => act("rejected")} className="btn-secondary py-1 text-xs" disabled={pending}>
              却下
            </button>
          </div>
        ) : (
          <button onClick={() => act(status === "approved" ? "rejected" : "approved")} className="text-xs text-gray-400 hover:text-brand" disabled={pending}>
            変更
          </button>
        )}
      </td>
    </tr>
  );
}
