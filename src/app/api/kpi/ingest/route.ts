import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// 本部KPIを保存する保護API。外部ランナー（Playwright）から日次でPOSTする。
// 認証: Authorization: Bearer <KPI_INGEST_SECRET>
//   body: { as_of?: "YYYY-MM-DD", data: FcKpiData }  ※ as_of 省略時は当日(JST)
export async function POST(req: NextRequest) {
  const secret = process.env.KPI_INGEST_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "KPI_INGEST_SECRET 未設定" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { as_of?: string; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "不正なJSON" }, { status: 400 });
  }
  if (!body.data || typeof body.data !== "object") {
    return NextResponse.json({ ok: false, error: "data がありません" }, { status: 400 });
  }

  const j = new Date(Date.now() + 9 * 3600 * 1000);
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(body.as_of ?? "")
    ? body.as_of!
    : `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}`;

  const admin = createAdminClient();
  const { error } = await admin.from("fc_kpi").upsert({ as_of: asOf, data: body.data }, { onConflict: "as_of" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, as_of: asOf });
}
