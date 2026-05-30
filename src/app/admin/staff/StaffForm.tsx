"use client";

import { useActionState } from "react";
import { createStaff, type ActionResult } from "./actions";

export default function StaffForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createStaff,
    null
  );

  return (
    <form action={formAction}>
      <p className="help" style={{ marginTop: 18 }}>
        登録するとログインID（メール）と初期パスワードが発行されます。内容は本人へ配布してください。
      </p>
      <div className="form-grid">
        <div className="field">
          <label>
            Name <span className="jp-label">／ 氏名</span>
          </label>
          <input name="full_name" className="input" placeholder="山田 花子" required />
        </div>
        <div className="field">
          <label>
            Role <span className="jp-label">／ 権限</span>
          </label>
          <select name="role" className="select" defaultValue="staff">
            <option value="staff">スタッフ</option>
            <option value="super_admin">オーナー</option>
          </select>
        </div>
        <div className="field full">
          <label>
            Login ID <span className="jp-label">／ ログインID（メール）</span>
          </label>
          <input name="email" type="email" className="input" placeholder="name@example.com" required />
        </div>
        <div className="field">
          <label>
            Password <span className="jp-label">／ 初期パスワード（8文字以上）</span>
          </label>
          <input name="password" type="text" className="input" required minLength={8} />
        </div>
        <div className="field">
          <label>
            Employment <span className="jp-label">／ 雇用形態</span>
          </label>
          <select name="employment_type" className="select" defaultValue="part_time">
            <option value="part_time">アルバイト</option>
            <option value="full_time">正社員</option>
          </select>
        </div>
        <div className="field">
          <label>
            Phone <span className="jp-label">／ 電話番号</span>
          </label>
          <input name="phone" className="input" />
        </div>
        <div className="field">
          <label>
            Wage <span className="jp-label">／ 時給（円）</span>
          </label>
          <input name="hourly_wage" type="number" min={0} className="input" />
        </div>
        <div className="field">
          <label>
            Weekly hours <span className="jp-label">／ 週の最低・最大時間</span>
          </label>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              name="min_hours_per_week"
              type="number"
              min={0}
              defaultValue={0}
              className="input"
              style={{ width: 90 }}
            />
            <span className="muted en">/</span>
            <input
              name="max_hours_per_week"
              type="number"
              min={1}
              defaultValue={40}
              className="input"
              style={{ width: 90 }}
            />
            <span className="muted" style={{ fontSize: 13 }}>
              時間
            </span>
          </div>
        </div>
        <div className="field">
          <label>
            Color <span className="jp-label">／ 表示色</span>
          </label>
          <input
            name="display_color"
            type="color"
            defaultValue="#1f4be0"
            className="input"
            style={{ height: 48, padding: 6 }}
          />
        </div>
      </div>

      {state && (
        <p
          style={{
            fontSize: 13,
            marginBottom: 16,
            color: state.ok ? "#3d6b4f" : "var(--accent-ink)",
          }}
        >
          {state.message}
        </p>
      )}

      <button type="submit" className="btn-fill" disabled={pending}>
        {pending ? "登録中..." : "スタッフを登録"}
      </button>
    </form>
  );
}
