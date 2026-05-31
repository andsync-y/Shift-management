import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  EMPLOYMENT_LABELS_JA,
  ROLE_LABELS_JA,
  type AvailabilityPreference,
  type FixedShift,
  type Profile,
} from "@/lib/types";
import AvailabilityEditor from "@/components/AvailabilityEditor";
import FixedShiftEditor from "@/components/FixedShiftEditor";
import CredentialsEditor from "@/components/CredentialsEditor";
import { emailToLoginId } from "@/lib/login-id";

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (!profile) notFound();
  const p = profile as Profile;

  const { data: availability } = await supabase
    .from("availability_preferences")
    .select("*")
    .eq("staff_id", id)
    .order("day_of_week");

  const { data: fixedShifts } = await supabase
    .from("fixed_shifts")
    .select("*")
    .eq("staff_id", id)
    .order("day_of_week");

  // ログインID(メール)は auth 側から取得
  let currentEmail: string | null = null;
  try {
    const admin = createAdminClient();
    const { data: authUser } = await admin.auth.admin.getUserById(id);
    currentEmail = emailToLoginId(authUser?.user?.email ?? null) || null;
  } catch {
    // service role 未設定などの場合は空表示で続行
  }

  return (
    <div className="page">
      <div className="crumbs">
        <Link href="/admin/staff">スタッフ管理</Link>
        <span className="sep">/</span>
        <span>{p.full_name}</span>
      </div>

      <div className="page-head">
        <div className="masthead">
          <div
            className="eyebrow accent"
            style={{ display: "flex", alignItems: "center", gap: 9 }}
          >
            <span
              className="dot"
              style={{ background: p.display_color, width: 9, height: 9 }}
            />
            {ROLE_LABELS_JA[p.role]} · {p.is_active ? "稼働中" : "停止"}
          </div>
          <h1 className="ttl">{p.full_name}</h1>
        </div>
        <Link href="/admin/staff" className="btn-outline">
          <span className="arrow">←</span> 一覧へ戻る
        </Link>
      </div>

      {/* profile */}
      <div className="section">
        <div className="section-head">
          <h2>プロフィール</h2>
          <span className="eyebrow">Profile</span>
        </div>
        <div className="section-body">
          <div className="profile-grid">
            <div className="profile-item">
              <div className="k">権限</div>
              <div className="v">{ROLE_LABELS_JA[p.role]}</div>
            </div>
            <div className="profile-item">
              <div className="k">雇用形態</div>
              <div className="v">{EMPLOYMENT_LABELS_JA[p.employment_type]}</div>
            </div>
            <div className="profile-item">
              <div className="k">電話</div>
              <div className="v mono">{p.phone ?? "—"}</div>
            </div>
            <div className="profile-item">
              <div className="k">時給</div>
              <div className="v mono">{p.hourly_wage ? `${p.hourly_wage}円` : "—"}</div>
            </div>
            <div className="profile-item">
              <div className="k">週の最低 / 最大時間</div>
              <div className="v mono">
                {p.min_hours_per_week} / {p.max_hours_per_week}h
              </div>
            </div>
            <div className="profile-item">
              <div className="k">ログインID</div>
              <div className="v mono">{currentEmail ?? "—"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* login info */}
      <div className="section">
        <div className="section-head">
          <h2>ログイン情報</h2>
          <span className="eyebrow">Credentials</span>
        </div>
        <div className="section-body">
          <p className="help" style={{ marginTop: 0, marginBottom: 24 }}>
            このスタッフのログインID（メール）とパスワードを変更します。変更後の内容を本人へお伝えください。
          </p>
          <CredentialsEditor
            staffId={p.id}
            currentEmail={currentEmail}
            currentPassword={p.initial_password}
          />
        </div>
      </div>

      {/* 希望シフト */}
      <div className="section">
        <div className="section-head">
          <h2>希望シフト（週次）</h2>
          <span className="eyebrow">Availability</span>
        </div>
        <div className="section-body">
          <p className="help" style={{ marginTop: 0, marginBottom: 4 }}>
            曜日ごとに勤務可能な時間帯と区分を登録します。「不可」を登録するとその時間帯には割り当てられません。AIシフト生成は「希望（優先）」を優先的に割り当てます。
          </p>
          <AvailabilityEditor
            staffId={p.id}
            initial={(availability ?? []) as AvailabilityPreference[]}
          />
        </div>
      </div>

      {/* 固定シフト */}
      <div className="section">
        <div className="section-head">
          <h2>固定シフト（週次の確定パターン）</h2>
          <span className="eyebrow">Fixed</span>
        </div>
        <div className="section-body">
          <p className="help" style={{ marginTop: 0, marginBottom: 4 }}>
            固定シフト制の運用向け。毎週この曜日はこの時間、というパターンを登録します。シフト作成画面の「固定シフトを展開」で、希望休を除いて今月分に一括反映できます。
          </p>
          <FixedShiftEditor
            staffId={p.id}
            initial={(fixedShifts ?? []) as FixedShift[]}
          />
        </div>
      </div>
    </div>
  );
}
