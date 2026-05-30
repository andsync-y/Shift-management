import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AvailabilityPreference } from "@/lib/types";
import AvailabilityEditor from "@/components/AvailabilityEditor";

// 希望シフトの編集はオーナーのみ（スタッフはアクセス不可）。
export default async function StaffAvailabilityPage() {
  const me = await requireAdmin();
  const supabase = await createClient();

  const { data: availability } = await supabase
    .from("availability_preferences")
    .select("*")
    .eq("staff_id", me.id)
    .order("day_of_week");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">希望シフト</h1>
      <div className="card">
        <p className="mb-4 text-sm text-gray-500">
          勤務できる曜日・時間帯を登録してください。「希望（優先）」にした時間帯はAIシフト生成で優先的に割り当てられます。
          逆に「不可」にした時間帯には割り当てられません。
        </p>
        <AvailabilityEditor
          staffId={me.id}
          initial={(availability ?? []) as AvailabilityPreference[]}
        />
      </div>
    </div>
  );
}
