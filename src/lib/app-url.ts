// アプリの公開 URL を組み立てる。
// LINE 通知などサーバー側から「ユーザーが開くリンク」を作るときに使う。
//
// 本番では NEXT_PUBLIC_APP_URL（例: https://shift.example.com）を設定する。
// 未設定ならパスだけ返す（リンクが相対になるが通知が壊れないようにする）。
export function appUrl(path = "/"): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
