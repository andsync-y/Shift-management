"use client";

import { useActionState } from "react";
import { updateStaffProfile } from "../actions";
import { EMPLOYMENT_LABELS_JA, ROLE_LABELS_JA, type Profile } from "@/lib/types";

// 雇用形態・電話・時給・週時間の編集（オーナー専用ページ内）。
export default function ProfileEditor({
  profile,
  loginId,
}: {
  profile: Profile;
  loginId: string | null;
}) {
  const action = updateStaffProfile.bind(null, profile.id);
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction}>
      <div className="profile-grid">
        {/* 読み取り専用 */}
        <div className="profile-item">
          <div className="k">権限</div>
          <div className="v">{ROLE_LABELS_JA[profile.role]}</div>
        </div>
        <div className="profile-item">
          <div className="k">ログインID</div>
          <div className="v mono">{loginId ?? "—"}</div>
        </div>

        {/* 編集可能（オーナーのみ） */}
        <div className="field">
          <label>氏名</label>
          <input name="full_name" type="text" className="input" defaultValue={profile.full_name} placeholder="例: 多和田 雄仁" required />
        </div>
        <div className="field">
          <label>雇用形態</label>
          <select name="employment_type" className="select" defaultValue={profile.employment_type}>
            <option value="part_time">{EMPLOYMENT_LABELS_JA.part_time}</option>
            <option value="full_time">{EMPLOYMENT_LABELS_JA.full_time}</option>
          </select>
        </div>
        <div className="field">
          <label>電話</label>
          <input name="phone" type="tel" className="input" defaultValue={profile.phone ?? ""} placeholder="090-0000-0000" />
        </div>
        <div className="field">
          <label>時給（円）</label>
          <input name="hourly_wage" type="number" min={0} className="input" defaultValue={profile.hourly_wage ?? ""} placeholder="例: 1100" />
        </div>
        <div className="field">
          <label>週の最低時間</label>
          <input name="min_hours_per_week" type="number" min={0} className="input" defaultValue={profile.min_hours_per_week} />
        </div>
        <div className="field">
          <label>週の最大時間</label>
          <input name="max_hours_per_week" type="number" min={1} className="input" defaultValue={profile.max_hours_per_week} />
        </div>
      </div>

      <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 16 }}>
        <button type="submit" className="btn-fill" disabled={pending}>
          {pending ? "保存中…" : "プロフィールを保存"}
        </button>
        {state && (
          <span className="help" style={{ color: state.ok ? "#3d6b4f" : "#9a3a30" }}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
