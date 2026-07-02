"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addStoreEvent, deleteStoreEvent } from "../actions";
import {
  DAY_LABELS_JA,
  STORE_EVENT_KIND_LABELS_JA,
  type StoreEvent,
} from "@/lib/types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function hm(t: string) {
  return t.slice(0, 5);
}

export default function StoreEventEditor({
  periodId,
  year,
  month,
  events,
}: {
  periodId: string;
  year: number;
  month: number;
  events: StoreEvent[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const lastDay = new Date(year, month, 0).getDate();

  async function handleAdd(formData: FormData) {
    const res = await addStoreEvent(periodId, formData);
    setMessage(res.message);
    if (res.ok) router.refresh();
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteStoreEvent(id, periodId);
      router.refresh();
    });
  }

  const sorted = [...events].sort((a, b) => a.event_date.localeCompare(b.event_date));

  return (
    <div className="space-y-4">
      <form action={handleAdd} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">日</label>
          <select name="event_date" className="input w-32" required defaultValue="">
            <option value="" disabled>
              選択
            </option>
            {Array.from({ length: lastDay }, (_, i) => {
              const d = i + 1;
              const date = `${year}-${pad(month)}-${pad(d)}`;
              const dow = new Date(year, month - 1, d).getDay();
              return (
                <option key={date} value={date}>
                  {month}/{d}({DAY_LABELS_JA[dow]})
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <label className="label">種別</label>
          <select name="kind" className="input w-28" defaultValue="closed">
            <option value="closed">店休</option>
            <option value="note">お知らせ</option>
          </select>
        </div>
        <div>
          <label className="label">内容</label>
          <input
            name="title"
            type="text"
            className="input w-52"
            placeholder="例: アドバンス講習"
            maxLength={100}
            required
          />
        </div>
        <div>
          <label className="label">開始（任意）</label>
          <input name="start_time" type="time" className="input w-28" />
        </div>
        <div>
          <label className="label">終了（任意）</label>
          <input name="end_time" type="time" className="input w-28" />
        </div>
        <label className="flex items-center gap-1.5 pb-2 text-sm">
          <input name="all_hands" type="checkbox" />
          全員参加
        </label>
        <div className="w-full">
          <label className="label">補足（任意）</label>
          <input
            name="body"
            type="text"
            className="input w-full max-w-xl"
            placeholder="例: 講師 金田さん"
            maxLength={500}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={pending}>
          追加
        </button>
      </form>

      {message && <p className="text-sm text-gray-600">{message}</p>}

      <div className="max-h-72 space-y-1 overflow-y-auto">
        {sorted.map((e) => {
          const [, m, d] = e.event_date.split("-");
          const dow = new Date(e.event_date).getDay();
          const time =
            e.start_time && e.end_time ? `${hm(e.start_time)}–${hm(e.end_time)}` : null;
          const sub = [time, e.all_hands ? "全員参加" : null, e.body]
            .filter(Boolean)
            .join("・");
          return (
            <div
              key={e.id}
              className="flex items-center gap-3 border-b border-gray-100 py-1.5 text-sm"
            >
              <span className="w-20 shrink-0 text-gray-500">
                {Number(m)}/{Number(d)}({DAY_LABELS_JA[dow]})
              </span>
              <span
                className={
                  "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold text-white " +
                  (e.kind === "closed" ? "bg-red-700" : "bg-sky-700")
                }
              >
                {STORE_EVENT_KIND_LABELS_JA[e.kind]}
              </span>
              <span className="font-medium">{e.title}</span>
              {sub && <span className="text-xs text-gray-500">{sub}</span>}
              <button
                onClick={() => handleDelete(e.id)}
                className="ml-auto opacity-70 hover:opacity-100"
                aria-label="削除"
                disabled={pending}
              >
                ×
              </button>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="py-2 text-sm text-gray-400">店休・お知らせはまだありません。</p>
        )}
      </div>
    </div>
  );
}
