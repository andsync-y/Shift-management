"use client";

import { useActionState } from "react";
import { createStaff, type ActionResult } from "./actions";

export default function StaffForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createStaff,
    null
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">氏名 *</label>
          <input name="full_name" className="input" required />
        </div>
        <div>
          <label className="label">権限</label>
          <select name="role" className="input" defaultValue="staff">
            <option value="staff">スタッフ</option>
            <option value="super_admin">管理者</option>
          </select>
        </div>
        <div>
          <label className="label">メールアドレス *</label>
          <input name="email" type="email" className="input" required />
        </div>
        <div>
          <label className="label">初期パスワード *（8文字以上）</label>
          <input name="password" type="text" className="input" required minLength={8} />
        </div>
        <div>
          <label className="label">雇用形態</label>
          <select name="employment_type" className="input" defaultValue="part_time">
            <option value="part_time">アルバイト</option>
            <option value="full_time">正社員</option>
          </select>
        </div>
        <div>
          <label className="label">電話番号</label>
          <input name="phone" className="input" />
        </div>
        <div>
          <label className="label">時給（円）</label>
          <input name="hourly_wage" type="number" min={0} className="input" />
        </div>
        <div>
          <label className="label">表示色</label>
          <input name="display_color" type="color" defaultValue="#e8380d" className="input h-10" />
        </div>
        <div>
          <label className="label">週の最低希望時間</label>
          <input name="min_hours_per_week" type="number" min={0} defaultValue={0} className="input" />
        </div>
        <div>
          <label className="label">週の最大勤務時間</label>
          <input name="max_hours_per_week" type="number" min={1} defaultValue={40} className="input" />
        </div>
      </div>

      {state && (
        <p className={`text-sm ${state.ok ? "text-green-600" : "text-red-600"}`}>
          {state.message}
        </p>
      )}

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "登録中..." : "スタッフを登録"}
      </button>
    </form>
  );
}
