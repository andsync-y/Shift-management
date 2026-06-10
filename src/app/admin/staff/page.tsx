import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  EMPLOYMENT_LABELS_JA,
  ROLE_LABELS_JA,
  type Profile,
} from "@/lib/types";
import { emailToLoginId } from "@/lib/login-id";
import StaffForm from "./StaffForm";

export default async function StaffPage() {
  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });

  // ログインID(メール)は auth 側にあるため、admin API でまとめて取得
  const emailById = new Map<string, string>();
  try {
    const admin = createAdminClient();
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of list?.users ?? []) {
      if (u.email) emailById.set(u.id, emailToLoginId(u.email));
    }
  } catch {
    // service role 未設定などの場合はメール非表示で続行
  }

  const list = (staff as Profile[] | null) ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Owner Console</div>
          <h1 className="ttl en">Staff</h1>
          <p className="sub">スタッフ管理</p>
        </div>
      </div>

      {/* accordion form */}
      <details className="accordion">
        <summary className="accordion-head">
          <h2>
            <span className="plus en">+</span> 新規スタッフ登録
          </h2>
          <span className="toggle">
            開く <span className="arrow">↘</span>
          </span>
        </summary>
        <div className="accordion-body">
          <StaffForm />
        </div>
      </details>

      {/* list */}
      <div className="section">
        <div className="section-head">
          <h2>
            登録済みスタッフ
            <span className="muted en" style={{ fontWeight: 400, fontSize: 14, marginLeft: 6 }}>
              {list.length}
            </span>
          </h2>
          <span className="eyebrow">Roster</span>
        </div>
        <div className="section-body" style={{ paddingTop: 8 }}>
          <p className="help" style={{ marginBottom: 22 }}>
            ※ ログインID・初期パスワードは本人へ配布用です。本人がパスワードを変更しても、ここの初期PW表示は変わりません。
          </p>

          {/* PC table */}
          <table className="staff-table">
            <thead>
              <tr>
                <th>氏名</th>
                <th>権限</th>
                <th>ログインID</th>
                <th>初期PW</th>
                <th>雇用形態</th>
                <th>週時間</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="staff-name">
                      <span className="dot" style={{ background: s.display_color }} />
                      {s.full_name}
                    </span>
                  </td>
                  <td className="soft">{ROLE_LABELS_JA[s.role]}</td>
                  <td className="staff-id">{emailById.get(s.id) ?? "—"}</td>
                  <td className="mono soft">{s.initial_password ?? "—"}</td>
                  <td className="soft">{s.role === "super_admin" ? "—" : EMPLOYMENT_LABELS_JA[s.employment_type]}</td>
                  <td className="mono soft">
                    {s.role === "super_admin" ? "—" : `${s.min_hours_per_week} / ${s.max_hours_per_week}h`}
                  </td>
                  <td>
                    {s.is_active ? (
                      <span className="pill">
                        <span className="dot" style={{ background: "oklch(0.6 0.06 150)" }} />
                        稼働中
                      </span>
                    ) : (
                      <span className="pill">
                        <span className="dot" style={{ background: "var(--ink-3)" }} />
                        停止
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <Link href={`/admin/staff/${s.id}`} className="btn-link">
                      詳細 <span className="arrow">→</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* mobile cards */}
          <div className="staff-cards">
            {list.map((s) => (
              <div className="staff-card" key={s.id}>
                <div className="top">
                  <span className="staff-name">
                    <span className="dot" style={{ background: s.display_color }} />
                    {s.full_name}
                  </span>
                  <Link href={`/admin/staff/${s.id}`} className="btn-link">
                    詳細 <span className="arrow">→</span>
                  </Link>
                </div>
                <div className="rows">
                  <div className="r">
                    <span className="k">権限</span>
                    <span className="v">{ROLE_LABELS_JA[s.role]}</span>
                  </div>
                  <div className="r">
                    <span className="k">ログインID</span>
                    <span className="v mono" style={{ fontSize: 12 }}>
                      {emailById.get(s.id) ?? "—"}
                    </span>
                  </div>
                  <div className="r">
                    <span className="k">初期PW</span>
                    <span className="v mono">{s.initial_password ?? "—"}</span>
                  </div>
                  <div className="r">
                    <span className="k">雇用形態</span>
                    <span className="v">{s.role === "super_admin" ? "—" : EMPLOYMENT_LABELS_JA[s.employment_type]}</span>
                  </div>
                  <div className="r">
                    <span className="k">週時間</span>
                    <span className="v mono">
                      {s.role === "super_admin" ? "—" : `${s.min_hours_per_week} / ${s.max_hours_per_week}h`}
                    </span>
                  </div>
                  <div className="r">
                    <span className="k">状態</span>
                    <span className="v">
                      <span className="pill">
                        <span
                          className="dot"
                          style={{
                            background: s.is_active ? "oklch(0.6 0.06 150)" : "var(--ink-3)",
                          }}
                        />
                        {s.is_active ? "稼働中" : "停止"}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {list.length === 0 && (
            <p className="help" style={{ marginTop: 0 }}>
              まだスタッフが登録されていません。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
