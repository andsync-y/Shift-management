import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import SalesManager, { type MonthlySale } from "./SalesManager";

export default async function SalesPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("monthly_sales")
    .select("*")
    .order("month", { ascending: false });

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">経理</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>
            Sales
          </h1>
          <p className="sub">月次売上の入力（手入力）</p>
        </div>
      </div>
      <SalesManager sales={(data ?? []) as MonthlySale[]} />
    </div>
  );
}
