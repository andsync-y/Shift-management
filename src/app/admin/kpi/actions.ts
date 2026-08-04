"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseStaffLines, type FcKpiData } from "@/lib/fc-kpi/types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function jstToday() {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}`;
}

// 本部KPIの手入力保存（スクレイパが未整備/失敗時のフォールバック）。オーナー専用。
export async function saveKpi(
  _prev: { ok: boolean; message: string } | null,
  formData: FormData
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const g = (k: string) => String(formData.get(k) ?? "").trim();
  const numOr = (k: string) => {
    const s = g(k).replace(/[^0-9.\-]/g, "");
    const n = Number(s);
    return s !== "" && Number.isFinite(n) ? n : undefined;
  };
  const pctOr = (k: string) => {
    const n = numOr(k);
    return n == null ? undefined : n / 100;
  };

  const as_of = /^\d{4}-\d{2}-\d{2}$/.test(g("as_of")) ? g("as_of") : jstToday();
  const data: FcKpiData = {
    asOf: as_of,
    month: {
      month: g("month") || undefined,
      sales: numOr("sales"),
      treatmentSales: numOr("treatmentSales"),
      couponSales: numOr("couponSales"),
      designationSales: numOr("designationSales"),
      newCount: numOr("newCount"),
      newRate: pctOr("newRate"),
      nominationCount: numOr("nominationCount"),
      nominationRate: pctOr("nominationRate"),
    },
    yesterday: {
      date: g("yDate") || undefined,
      newSales: parseStaffLines(g("newSales")),
      nominations: parseStaffLines(g("nominations")).map((x) => ({ staff: x.staff, count: x.ticket })),
    },
  };

  const supabase = await createClient();
  const { error } = await supabase.from("fc_kpi").upsert({ as_of, data }, { onConflict: "as_of" });
  if (error) return { ok: false, message: `保存に失敗: ${error.message}` };
  revalidatePath("/admin/kpi");
  return { ok: true, message: "保存しました。kioskに反映されます。" };
}
