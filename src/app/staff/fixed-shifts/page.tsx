import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FixedShift } from "@/lib/types";
import FixedShiftEditor from "@/components/FixedShiftEditor";

export default async function StaffFixedShiftsPage() {
  const me = await requireUser();
  const supabase = await createClient();

  const { data: fixedShifts } = await supabase
    .from("fixed_shifts")
    .select("*")
    .eq("staff_id", me.id)
    .order("day_of_week");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">固定シフト</h1>
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
