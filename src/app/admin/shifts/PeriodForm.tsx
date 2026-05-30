"use client";

import { useActionState } from "react";
import { createPeriod } from "./actions";

const now = new Date();

export default function PeriodForm() {
  const [state, formAction, pending] = useActionState(createPeriod, null);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label">年</label>
        <input
          name="year"
          type="number"
          className="input w-28"
          defaultValue={now.getFullYear()}
          required
        />
      </div>
      <div>
        <label className="label">月</label>
        <input
          name="month"
          type="number"
          min={1}
          max={12}
          className="input w-20"
          defaultValue={now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2}
          required
        />
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        期間を作成
      </button>
      {state && (
        <span className={`text-sm ${state.ok ? "text-green-600" : "text-red-600"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
