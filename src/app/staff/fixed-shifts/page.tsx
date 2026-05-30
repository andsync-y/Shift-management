import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FixedShift } from "@/lib/types";
import FixedShiftEditor from "@/components/FixedShiftEditor";

// 固定シフトの編集はオーナーのみ（スタッフはアクセス不可）。
export default async function StaffFixedShiftsPage() {
  const me = await requireAdmin();
  const supabase = await createClient();

  const { data: fixedShifts } = await supabase
    .from("fixed_shifts")
    .select("*")
    .eq("staff_id", me.id)
    .order("day_of_week");

  return (
    <div className="page space-y-6">
      <div className="masthead" style={{ marginBottom: 8 }}>
        <div className="eyebrow accent">Owner Console</div>
        <h1 className="ttl en">Fixed Shifts</h1>
        <p className="sub">固定シフト</p>
      </div>
      <div className="card">
        <p className="mb-4 text-sm text-gray-500">
          毎週固定で勤務する曜日・時間帯です。変更が必要な場合は店長にご相談ください。
        </p>
        <FixedShiftEditor
          staffId={me.id}
          initial={(fixedShifts ?? []) as FixedShift[]}
        />
      </div>
    </div>
  );
}
