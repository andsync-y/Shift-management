"use client";

import { useState, useTransition } from "react";
import {
  pushToSalonBoard,
  type SalonBoardActionResult,
} from "./salonboard-actions";

export default function SalonBoardPanel({ periodId }: { periodId: string }) {
  const [pending, startTransition] = useTransition();
  const [res, setRes] = useState<SalonBoardActionResult | null>(null);

  function handlePush() {
    if (
      !confirm(
        "確定シフトをホットペッパービューティーのサロンボードへ反映します。よろしいですか？"
      )
    ) {
      return;
    }
    startTransition(async () => {
      setRes(await pushToSalonBoard(periodId));
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        確定したシフトをサロンボードへ自動入力します（ブラウザ自動操作）。
        環境変数 <code className="rounded bg-gray-100 px-1">SALONBOARD_LOGIN_ID</code> /
        <code className="rounded bg-gray-100 px-1">SALONBOARD_PASSWORD</code> の設定と
        Playwright のインストールが必要です。
      </p>
      <button onClick={handlePush} className="btn-primary" disabled={pending}>
        {pending ? "反映中..." : "サロンボードへ反映"}
      </button>

      {res && (
        <div
          className={`rounded-md border p-3 text-sm ${
            res.ok
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          <p>{res.message}</p>
          {(res.pushed > 0 || res.failed > 0) && (
            <p className="mt-1 text-xs">
              反映: {res.pushed}件 / 失敗: {res.failed}件
            </p>
          )}
        </div>
      )}
    </div>
  );
}
