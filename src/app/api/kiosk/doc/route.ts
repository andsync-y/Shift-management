import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PATHS: Record<string, string> = { counseling: "counseling", ticket: "ticket-terms" };

// 受付タブレット用：保持している店舗書類を同一オリジンで配信する（iframe で表示・印刷）。
//   GET /api/kiosk/doc?token=<KIOSK_TOKEN>&type=counseling|ticket
export async function GET(req: NextRequest) {
  const expected = process.env.KIOSK_TOKEN;
  if (!expected) return new Response("KIOSK_TOKEN 未設定", { status: 500 });
  const url = new URL(req.url);
  if (url.searchParams.get("token") !== expected) return new Response("unauthorized", { status: 401 });
  const path = PATHS[url.searchParams.get("type") ?? ""];
  if (!path) return new Response("bad type", { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("documents").download(path);
  if (error || !data) {
    return new Response("まだ書類が登録されていません。管理画面の「店舗書類」からアップロードしてください。", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const buf = Buffer.from(await data.arrayBuffer());
  return new Response(buf, {
    headers: {
      "Content-Type": data.type || "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "no-store",
    },
  });
}
