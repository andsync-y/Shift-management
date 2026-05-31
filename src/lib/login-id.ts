// ログインID ↔ メール の変換。
// Supabase Auth は内部的にメールアドレスを必要とするため、
// 「@」を含まない単純なログインID（例: fukuda）には内部ドメインを補って
// メール形式に変換する。すでにメール（@入り）の場合はそのまま使う。
//   fukuda            → fukuda@staff.andsync.jp
//   y.tawada@andsync.jp → y.tawada@andsync.jp（既存のメールはそのまま）
//
// ドメインは NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN で上書き可能（未設定なら下記の既定）。
// ここに使うドメインで実際にメール送信はしない（確認メールはスキップ運用）。
const DOMAIN = (process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN || "staff.andsync.jp").replace(/^@+/, "");

export function loginIdToEmail(idOrEmail: string): string {
  const v = idOrEmail.trim();
  return v.includes("@") ? v : `${v}@${DOMAIN}`;
}

export function emailToLoginId(email: string | null | undefined): string {
  if (!email) return "";
  const suffix = `@${DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}

// ログインIDの形式チェック（単純ID または メール）。
export function isValidLoginId(v: string): boolean {
  const s = v.trim();
  if (s.length < 3) return false;
  if (s.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  return /^[A-Za-z0-9._-]+$/.test(s);
}
