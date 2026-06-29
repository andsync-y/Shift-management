"use client";

import { useActionState } from "react";
import { updateStaffProfile } from "../actions";
import { EMPLOYMENT_LABELS_JA, ROLE_LABELS_JA, WORK_STATUS_LABELS_JA, type Profile } from "@/lib/types";

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
      <div className="profile-cats">
        {/* 基本情報 */}
        <section>
          <h3 className="profile-cat-h">基本情報</h3>
          <div className="profile-cols">
            <div className="profile-item">
              <div className="k">権限</div>
              <div className="v">{ROLE_LABELS_JA[profile.role]}</div>
            </div>
            <div className="profile-item">
              <div className="k">ログインID</div>
              <div className="v mono">{loginId ?? "—"}</div>
            </div>
            <div className="field">
              <label>氏名</label>
              <input name="full_name" type="text" className="input" defaultValue={profile.full_name} placeholder="例: 多和田 雄仁" required />
            </div>
            <div className="field">
              <label>表示名</label>
              <input name="display_name" type="text" className="input" defaultValue={profile.display_name ?? ""} placeholder="例: AINA" />
            </div>
            <div className="field">
              <label>カナ氏名（FC本部用）</label>
              <input name="name_kana" type="text" className="input" defaultValue={profile.name_kana ?? ""} placeholder="例: タワダ ユウジン" />
            </div>
            <div className="field">
              <label>在籍状況</label>
              <select name="work_status" className="select" defaultValue={profile.work_status ?? "active"}>
                <option value="active">{WORK_STATUS_LABELS_JA.active}</option>
                <option value="on_leave">{WORK_STATUS_LABELS_JA.on_leave}</option>
                <option value="retired">{WORK_STATUS_LABELS_JA.retired}</option>
              </select>
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
          </div>
        </section>

        {/* 給与・勤務 */}
        <section>
          <h3 className="profile-cat-h">給与・勤務</h3>
          <div className="profile-cols">
            <div className="field">
              <label>時給（円）</label>
              <input name="hourly_wage" type="number" min={0} className="input" defaultValue={profile.hourly_wage ?? ""} placeholder="例: 1100" />
            </div>
            <div className="field">
              <label>片道距離（km）</label>
              <input name="commute_distance_km" type="number" min={0} step="0.1" className="input" defaultValue={profile.commute_distance_km ?? ""} placeholder="例: 4.5" />
              <p className="help" style={{ margin: "4px 0 0" }}>交通費＝片道×2×15円×勤務日数で自動計算。</p>
            </div>
            <div className="field">
              <label>週の所定労働時間（社保判定）</label>
              <input name="contracted_weekly_hours" type="number" min={0} max={168} step={0.5} className="input" defaultValue={profile.contracted_weekly_hours ?? ""} placeholder="例: 20（空欄=実績）" />
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
        </section>

        {/* 振込先口座 */}
        <section>
          <h3 className="profile-cat-h">振込先口座</h3>
          <div className="profile-cols">
            <div className="field">
              <label>銀行コード（4桁）</label>
              <input name="bank_code" type="text" inputMode="numeric" className="input" defaultValue={profile.bank_code ?? ""} placeholder="例: 0009" />
            </div>
            <div className="field">
              <label>支店コード（3桁）</label>
              <input name="branch_code" type="text" inputMode="numeric" className="input" defaultValue={profile.branch_code ?? ""} placeholder="例: 123" />
            </div>
            <div className="field">
              <label>預金種目</label>
              <select name="account_type" className="select" defaultValue={profile.account_type ?? "1"}>
                <option value="1">普通</option>
                <option value="2">当座</option>
              </select>
            </div>
            <div className="field">
              <label>口座番号（7桁）</label>
              <input name="account_number" type="text" inputMode="numeric" className="input" defaultValue={profile.account_number ?? ""} placeholder="例: 1234567" />
            </div>
            <div className="field">
              <label>受取人名（カナ）</label>
              <input name="recipient_kana" type="text" className="input" defaultValue={profile.recipient_kana ?? ""} placeholder="例: ﾌｸﾀﾞ ｱｲﾅ" />
            </div>
          </div>
        </section>
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
