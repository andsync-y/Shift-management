import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 店舗書類の保存先（固定パス）。差し替えは upsert で同じパスに上書き＝URL不変。
const PATHS: Record<string, string> = { counseling: "counseling", ticket: "ticket-terms" };

// 管理画面から書類（PDF/画像）をアップロード。オーナー専用。
//   multipart/form-data: type=counseling|ticket, file
export async function POST(req: NextRequest) {
  await requireAdmin();
  const form = await req.formData().catch(() => null);
  const type = String(form?.get("type") ?? "");
  const file = form?.get("file");
  const path = PATHS[type];
  if (!path) return NextResponse.json({ ok: false, error: "種別が不正です。" }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "ファイルがありません。" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const admin = createAdminClient();
  const { error } = await admin.storage.from("documents").upload(path, bytes, {
    contentType: file.type || "application/pdf",
    upsert: true,
  });
  if (error) {
    return NextResponse.json(
      { ok: false, error: `${error.message}（documents バケット未作成かもしれません＝migration 0030）` },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
