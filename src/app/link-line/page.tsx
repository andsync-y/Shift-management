import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LinkLineForm from "./LinkLineForm";

// LINE 初回ひも付け画面。
// まだ profiles.line_user_id に紐づいていない LINE アカウントでログインした場合に来る。
// 既存のログインID（メール）＋パスワードで本人確認し、その LINE を自分に紐づける。
export default async function LinkLinePage() {
  const pending = (await cookies()).get("line_pending_id")?.value;
  if (!pending) redirect("/login");

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="eyebrow accent">LINE 連携</div>
        <h1 className="login-title en">Link LINE</h1>
        <p className="login-sub">
          初回のみ、お持ちのログインIDで本人確認します。次回からはLINEだけでログインできます。
        </p>
        <LinkLineForm />
      </div>
    </div>
  );
}
