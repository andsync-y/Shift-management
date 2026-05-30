"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generatePeriodShifts,
  generatePeriodShiftsWithClaude,
  expandFixedShifts,
  setPeriodStatus,
  type GenerateActionResult,
  type ClaudeGenerateActionResult,
  type ExpandFixedActionResult,
} from "../actions";
import type { PeriodStatus } from "@/lib/types";

export default function GeneratePanel({
  periodId,
  status,
}: {
  periodId: string;
  status: PeriodStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [res, setRes] = useState<GenerateActionResult | null>(null);
  const [claudeRes, setClaudeRes] = useState<ClaudeGenerateActionResult | null>(null);
  const [fixedRes, setFixedRes] = useState<ExpandFixedActionResult | null>(null);

  function handleGenerate() {
    startTransition(async () => {
      const r = await generatePeriodShifts(periodId);
      setRes(r);
      setClaudeRes(null);
      setFixedRes(null);
      router.refresh();
    });
  }

  function handleGenerateWithClaude() {
    startTransition(async () => {
      const r = await generatePeriodShiftsWithClaude(periodId);
      setClaudeRes(r);
      setRes(null);
      setFixedRes(null);
      router.refresh();
    });
  }

  function handleExpandFixed() {
    startTransition(async () => {
      const r = await expandFixedShifts(periodId);
      setFixedRes(r);
      setRes(null);
      setClaudeRes(null);
      router.refresh();
    });
  }

  function changeStatus(next: PeriodStatus) {
    startTransition(async () => {
      await setPeriodStatus(periodId, next);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <button onClick={handleExpandFixed} className="btn-primary" disabled={pending}>
          {pending ? "処理中..." : "📌 固定シフトを展開"}
        </button>

        <button onClick={handleGenerate} className="btn-secondary" disabled={pending}>
          {pending ? "生成中..." : "🤖 ソルバーで自動生成"}
        </button>

        <button onClick={handleGenerateWithClaude} className="btn-secondary" disabled={pending}>
          {pending ? "生成中..." : "🧠 Claudeで生成（店舗ルール参照）"}
        </button>

        {status === "draft" && (
          <button
            onClick={() => changeStatus("published")}
            className="btn-secondary"
            disabled={pending}
          >
            スタッフに公開
          </button>
        )}
        {status === "published" && (
          <>
            <button
              onClick={() => changeStatus("confirmed")}
              className="btn-primary"
              disabled={pending}
            >
              シフトを確定
            </button>
            <button
              onClick={() => changeStatus("draft")}
              className="btn-secondary"
              disabled={pending}
            >
              下書きに戻す
            </button>
          </>
        )}
        {status === "confirmed" && (
          <button
            onClick={() => changeStatus("published")}
            className="btn-secondary"
            disabled={pending}
          >
            確定を解除
          </button>
        )}
      </div>

      <p className="text-xs text-gray-500">
        生成は希望シフト・承認済みお休み希望・必要人数をもとに行われます。再生成すると既存の自動生成シフトは置き換わります。
      </p>

      {res && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
          <p className={res.ok ? "text-green-700" : "text-red-600"}>{res.message}</p>

          {res.result && res.result.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-amber-700">
              {res.result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          {res.result && res.result.shortages.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-amber-700">
                人手不足の時間帯（{res.result.shortages.length}件）
              </summary>
              <ul className="mt-1 max-h-48 overflow-y-auto text-xs text-gray-600">
                {res.result.shortages.map((s, i) => (
                  <li key={i}>
                    {s.work_date} {s.start_time}–{s.end_time}：必要{s.required} / 充足{s.filled}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {res.review && (
            <div className="mt-3 border-t border-gray-200 pt-3">
              <p className="font-semibold text-gray-700">🧠 AI講評</p>
              <p className="mt-1 text-gray-600">{res.review.summary}</p>
              {res.review.suggestions.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-gray-600">
                  {res.review.suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {fixedRes && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
          <p className={fixedRes.ok ? "text-green-700" : "text-red-600"}>
            📌 {fixedRes.message}
          </p>
        </div>
      )}

      {claudeRes && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
          <p className={claudeRes.ok ? "text-green-700" : "text-red-600"}>
            🧠 {claudeRes.message}
          </p>

          {claudeRes.result?.summary && (
            <p className="mt-2 text-gray-700">{claudeRes.result.summary}</p>
          )}

          {claudeRes.result && claudeRes.result.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-amber-700">
              {claudeRes.result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
