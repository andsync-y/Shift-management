import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { exchangeLineCode, isLineLoginEnabled } from "@/lib/line";
import { createAdminClient } from "@/lib/supabase/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

function fail(req: NextRequest, code: string) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?line_error=${code}`;
  return NextResponse.redirect(url);
}

// LINE 認可後のコールバック：
//  1) state 検証 → 2) code を交換して line_user_id 取得
//  3) profiles.line_user_id で既存スタッフを照合
//  4) その auth ユーザーとして Supabase セッションを発行（magiclink + verifyOtp）
export async function GET(req: NextRequest) {
  if (!isLineLoginEnabled()) return fail(req, "disabled");

  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const savedState = cookieStore.get("line_oauth_state")?.value;
  const savedNonce = cookieStore.get("line_oauth_nonce")?.value;

  if (!code || !state || !savedState || state !== savedState || !savedNonce) {
    return fail(req, "state");
  }

  let lineUserId: string;
  try {
    const profile = await exchangeLineCode(code, savedNonce);
    lineUserId = profile.lineUserId;
  } catch {
    return fail(req, "exchange");
  }

  const admin = createAdminClient();

  // 連携済みスタッフを探す
  const { data: matched } = await admin
    .from("profiles")
    .select("id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (!matched) {
    // 未連携の LINE アカウント。勝手に作らず、ひも付け画面へ誘導。
    const res = NextResponse.redirect(new URL("/link-line", url.origin));
    res.cookies.set("line_pending_id", lineUserId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  }

  // auth ユーザーのメール（内部識別子）を取得して magiclink を発行
  const { data: authUser } = await admin.auth.admin.getUserById(matched.id);
  const email = authUser.user?.email;
  if (!email) return fail(req, "nouser");

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return fail(req, "link");
  }

  // verifyOtp でセッション cookie をこのレスポンスに載せる
  let res = NextResponse.redirect(new URL("/", url.origin));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error: otpErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (otpErr) return fail(req, "session");

  // 使い終えた state/nonce を片付ける
  res.cookies.delete("line_oauth_state");
  res.cookies.delete("line_oauth_nonce");
  return res;
}
