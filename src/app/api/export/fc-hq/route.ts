import { NextResponse, type NextRequest } from "next/server";
import { buildFcHqReport } from "@/lib/fc-hq/report";

export const dynamic = "force-dynamic";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function jstYearMonth(): string {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}`;
}

// FC本部転記用の月次JSONを返す保護API。
// 認証は CRON_SECRET（Authorization: Bearer <secret> もしくは ?key=<secret>）。
// 将来のRPAランナー（tools/fc-hq-sync）から叩いて本部フォームへ転記する用途。
//   GET /api/export/fc-hq?month=YYYY-MM&key=<CRON_SECRET>
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET が未設定です" }, { status: 500 });
  const auth = req.headers.get("authorization");
  const key = new URL(req.url).searchParams.get("key");
  if (auth !== `Bearer ${secret}` && key !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const monthParam = new URL(req.url).searchParams.get("month");
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? "") ? monthParam! : jstYearMonth();

  const report = await buildFcHqReport(month);
  return NextResponse.json({ ok: true, ...report });
}
