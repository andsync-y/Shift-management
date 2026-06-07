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
const LOGIN_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const PUSH_URL = "https://api.line.me/v2/bot/message/push";
const REPLY_URL = "https://api.line.me/v2/bot/message/reply";

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
// id_token は LINE の検証エンドポイント(/oauth2/v2.1/verify)で
// 署名・有効期限・aud(client_id一致)・nonce をサーバ側検証してから採用する。
export async function exchangeLineCode(
  code: string,
  expectedNonce: string
): Promise<LineProfile> {
  // 1) code → id_token
  const tokenRes = await fetch(LOGIN_TOKEN_URL, {
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
  if (!tokenRes.ok) {
    throw new Error(`LINE token exchange failed: ${tokenRes.status}`);
  }
  const token = (await tokenRes.json()) as { id_token?: string };
  if (!token.id_token) throw new Error("LINE token response missing id_token");

  // 2) id_token を LINE 側で検証（署名/exp/aud/nonce）。
  //    nonce を渡すと、認可開始時に発行した値と一致するかも検証してくれる。
  const verifyRes = await fetch(LOGIN_VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: token.id_token,
      client_id: process.env.LINE_LOGIN_CHANNEL_ID!,
      nonce: expectedNonce,
    }),
  });
  if (!verifyRes.ok) {
    throw new Error(`LINE id_token verification failed: ${verifyRes.status}`);
  }
  const claims = (await verifyRes.json()) as {
    sub?: string;
    name?: string;
    picture?: string;
    aud?: string;
    nonce?: string;
  };

  // 念のためアプリ側でも aud / nonce を再確認（多層防御）。
  if (claims.aud !== process.env.LINE_LOGIN_CHANNEL_ID) {
    throw new Error("LINE id_token aud mismatch");
  }
  if (claims.nonce !== expectedNonce) {
    throw new Error("LINE id_token nonce mismatch");
  }
  if (!claims.sub) throw new Error("LINE id_token missing sub");

  return {
    lineUserId: claims.sub,
    displayName: typeof claims.name === "string" ? claims.name : null,
    pictureUrl: typeof claims.picture === "string" ? claims.picture : null,
  };
}

// LIFF から受け取った id_token を検証し、LINEユーザーID(sub)を返す。
// LIFFは LINEログインチャネル配下なので aud は LINE_LOGIN_CHANNEL_ID。
export async function verifyLineIdToken(idToken: string): Promise<string | null> {
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!clientId || !idToken) return null;
  try {
    const res = await fetch(LOGIN_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
    });
    if (!res.ok) return null;
    const claims = (await res.json()) as { sub?: string; aud?: string };
    if (claims.aud !== clientId || !claims.sub) return null;
    return claims.sub;
  } catch {
    return null;
  }
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

// ---------------------------------------------------------------------
// LINE Webhook（受信）: 署名検証 + 返信
// ---------------------------------------------------------------------

// Webhook の署名検証。X-Line-Signature = base64(HMAC-SHA256(channelSecret, rawBody))。
export async function verifyLineSignature(rawBody: string, signature: string | null): Promise<boolean> {
  const secret = process.env.LINE_MESSAGING_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const { createHmac, timingSafeEqual } = await import("crypto");
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// replyToken を使って返信する。quickReply に位置情報ボタン等を付けられる。
export async function replyLineMessage(
  replyToken: string,
  text: string,
  quickReply?: unknown
): Promise<boolean> {
  if (!isLineNotifyEnabled()) return false;
  try {
    const message: Record<string, unknown> = { type: "text", text };
    if (quickReply) message.quickReply = quickReply;
    const res = await fetch(REPLY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ replyToken, messages: [message] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// 位置情報を求めるクイックリプライ（LINEの「位置情報を送る」ボタン）。
export const locationQuickReply = {
  items: [
    {
      type: "action",
      action: { type: "location", label: "現在地を送る" },
    },
  ],
};
