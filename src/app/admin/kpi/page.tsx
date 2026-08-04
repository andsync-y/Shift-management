import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FcKpiData } from "@/lib/fc-kpi/types";
import KpiForm from "./KpiForm";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// 本部KPIの確認・手入力（スクレイパの最新値を表示＋手動上書き）。
export default async function KpiAdminPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("fc_kpi")
    .select("as_of, data, updated_at")
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();

  const j = new Date(Date.now() + 9 * 3600 * 1000);
  const today = `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}`;
  const snap = (data as { as_of: string; data: FcKpiData; updated_at: string } | null) ?? null;

  return (
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Owner Console</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>Store KPI</h1>
          <p className="sub">
            店舗実績（本部システム）— kiosk表示用
            {snap && <span className="muted"> ／ 最新: {snap.as_of}（更新 {new Date(snap.updated_at).toLocaleString("ja-JP")}）</span>}
          </p>
        </div>
      </div>
      <p className="help" style={{ marginTop: 0, marginBottom: 18 }}>
        本部システムから日次で自動取得した数値がここに入り、kiosk画面に表示されます。自動取得が未整備／失敗の
        ときは、ここで手入力すればkioskに反映されます（同じ取得日は上書き）。
      </p>
      <KpiForm initial={snap?.data ?? {}} asOf={snap?.as_of ?? today} />
    </div>
  );
}
