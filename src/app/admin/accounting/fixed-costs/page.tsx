import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { FixedCost } from "@/lib/accounting/fixed-costs";
import FixedCostManager from "./FixedCostManager";

export default async function FixedCostsPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("fixed_costs")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const costs = (data ?? []) as FixedCost[];

  return (
    <div className="page page-wide">
      <div className="crumbs">
        <Link href="/admin/accounting">月次P&L</Link>
        <span className="sep">/</span>
        <span>固定費</span>
      </div>
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">経理</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>Fixed Costs</h1>
          <p className="sub">固定費（毎月の定額費用）— 月次P&Lの経常利益・キャッシュ収支に反映</p>
        </div>
      </div>
      <div className="section">
        <div className="section-head">
          <h2>固定費一覧</h2>
          <span className="eyebrow">Monthly</span>
        </div>
        <div className="section-body" style={{ overflowX: "auto", paddingTop: 12 }}>
          <FixedCostManager costs={costs} />
        </div>
      </div>
    </div>
  );
}
