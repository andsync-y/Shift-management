// =====================================================================
// LINE 連携ラッパ（ログイン用 OIDC ＋ 通知用 Messaging API）
// =====================================================================
// すべて環境変数でキーを受け取り、未設定なら「無効」として静かに no-op する。
// → キー未設定の環境（プレビュー等）でも既存のメール+パスワードログインが
//    そのまま動くようにするための段階移行設計。
//
// 必要な環境変数（本番のみ・docs/LINE_INTEGRATION.md 参照）:
//   LINE_LOGIN_CHANNEL_ID
//   LINE_LOGIN_CHANNEL_SECRET
//   LINE_LOGIN_REDIRECT_URI
//   LINE_MESSAGING_CHANNEL_ACCESS_TOKEN
// =====================================================================

const LOGIN_AUTH_URL = "https://access.line.me/oauth2/v2.1/authorize";
const LOGIN_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const PUSH_URL = "https://api.line.me/v2/bot/message/push";

export function isLineLoginEnabled(): boolean {
  return Boolean(
    process.env.LINE_LOGIN_CHANNEL_ID &&
      process.env.LINE_LOGIN_CHANNEL_SECRET &&
      process.env.LINE_LOGIN_REDIRECT_URI
  );
}

export function isLineNotifyEnabled(): boolean {
  return Boolean(process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN);
}

// ---------------------------------------------------------------------
// LINE ログイン（OIDC）
// ---------------------------------------------------------------------

// 認可画面の URL を組み立てる。state / nonce は呼び出し側で生成し cookie に保存する。
export function buildLineAuthUrl(state: string, nonce: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINE_LOGIN_CHANNEL_ID!,
    redirect_uri: process.env.LINE_LOGIN_REDIRECT_URI!,
    state,
    scope: "openid profile",
    nonce,
  });
  return `${LOGIN_AUTH_URL}?${params.toString()}`;
}

export interface LineProfile {
  lineUserId: string; // OIDC sub（U... の固定ID）
  displayName: string | null;
  pictureUrl: string | null;
}

// callback で受け取った code を ID トークンに交換し、本人情報を取り出す。
// 注意: 本番導入時は id_token の署名・aud・nonce 検証を必ず追加すること。
export async function exchangeLineCode(code: string): Promise<LineProfile> {
  const res = await fetch(LOGIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.LINE_LOGIN_REDIRECT_URI!,
      client_id: process.env.LINE_LOGIN_CHANNEL_ID!,
      client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET!,
    }),
  });

  if (!res.ok) {
    throw new Error(`LINE token exchange failed: ${res.status}`);
  }
  const json = (await res.json()) as { id_token?: string };
  if (!json.id_token) throw new Error("LINE token response missing id_token");

  const claims = decodeJwtPayload(json.id_token);
  return {
    lineUserId: String(claims.sub),
    displayName: typeof claims.name === "string" ? claims.name : null,
    pictureUrl: typeof claims.picture === "string" ? claims.picture : null,
  };
}

// 署名検証なしの簡易デコード（payload 取り出し用）。
// TODO(本番): jose 等で署名・iss・aud・exp・nonce を検証する。
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid jwt");
  const payload = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(payload) as Record<string, unknown>;
}

// ---------------------------------------------------------------------
// LINE 通知（Messaging API push）
// ---------------------------------------------------------------------

// 1人に push。未設定・未連携・失敗は false を返し、呼び出し側の処理は止めない。
export async function pushLineMessage(
  lineUserId: string | null | undefined,
  text: string
): Promise<boolean> {
  if (!isLineNotifyEnabled() || !lineUserId) return false;
  try {
    const res = await fetch(PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: "text", text }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// 複数人へ push（公開通知など）。送信できた件数を返す。
export async function pushLineToMany(
  lineUserIds: (string | null | undefined)[],
  text: string
): Promise<number> {
  if (!isLineNotifyEnabled()) return 0;
  const results = await Promise.all(lineUserIds.map((id) => pushLineMessage(id, text)));
  return results.filter(Boolean).length;
}
