"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelTimeOff } from "./actions";
import {
  REQUEST_STATUS_LABELS_JA,
  type RequestStatus,
  type TimeOffRequest,
} from "@/lib/types";

function StatusPill({ status }: { status: RequestStatus }) {
  const cls = status === "approved" ? "ok" : status === "rejected" ? "no" : "wait";
  const dot =
    status === "approved" ? "#3d6b4f" : status === "rejected" ? "#9a3a30" : "#94650e";
  return (
    <span className={`status-pill ${cls}`}>
      <span className="dot" style={{ background: dot }} />
      {REQUEST_STATUS_LABELS_JA[status]}
    </span>
  );
}

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
    return (
      <p className="help" style={{ margin: 0 }}>
        まだ申請はありません。
      </p>
    );
  }

  return (
    <div className="history-list">
      {requests.map((r) => {
        const [, m, d] = r.off_date.split("-");
        const isChange = r.request_type === "time_change";
        const time =
          r.start_time && r.end_time
            ? `${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}`
            : "終日";
        return (
          <div className="history-row" key={r.id}>
            <div className="hr-date en">
              {Number(m)}/{Number(d)}
            </div>
            <div className="hr-meta">
              <span className={`mk ${isChange ? "late" : "early"}`} style={{ fontSize: 10.5 }}>
                {isChange ? "時間変更" : "休み"}
              </span>
              <span className="mono soft">{time}</span>
              {r.reason && <span className="muted">· {r.reason}</span>}
              {r.status === "pending" && (
                <button
                  className="btn-link ink"
                  style={{ fontSize: 12 }}
                  onClick={() => cancel(r.id)}
                  disabled={pending}
                >
                  取消
                </button>
              )}
            </div>
            <StatusPill status={r.status as RequestStatus} />
          </div>
        );
      })}
    </div>
  );
}
