import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildLineAuthUrl, isLineLoginEnabled } from "@/lib/line";

// LINE ログイン開始：state/nonce を発行して cookie に保存し、LINE 認可画面へ。
export async function GET() {
  if (!isLineLoginEnabled()) {
    return NextResponse.redirect(new URL("/login?line=disabled", baseUrl()));
  }

  const state = randomBytes(16).toString("hex");
  const nonce = randomBytes(16).toString("hex");

  const res = NextResponse.redirect(buildLineAuthUrl(state, nonce));
  const opts = {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10分
  };
  res.cookies.set("line_oauth_state", state, opts);
  res.cookies.set("line_oauth_nonce", nonce, opts);
  return res;
}

function baseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
