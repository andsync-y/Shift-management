import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  EMPLOYMENT_LABELS_JA,
  ROLE_LABELS_JA,
  type AvailabilityPreference,
  type FixedShift,
  type Profile,
} from "@/lib/types";
import AvailabilityEditor from "@/components/AvailabilityEditor";
import FixedShiftEditor from "@/components/FixedShiftEditor";

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (!profile) notFound();
  const p = profile as Profile;

  const { data: availability } = await supabase
    .from("availability_preferences")
    .select("*")
    .eq("staff_id", id)
    .order("day_of_week");

  const { data: fixedShifts } = await supabase
    .from("fixed_shifts")
    .select("*")
    .eq("staff_id", id)
    .order("day_of_week");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/staff" className="hover:text-brand">
          スタッフ管理
        </Link>
        <span>/</span>
        <span>{p.full_name}</span>
      </div>

      <h1 className="text-2xl font-bold">{p.full_name}</h1>

      <div className="card">
        <h2 className="mb-3 font-semibold">プロフィール</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-gray-500">権限</dt>
            <dd>{ROLE_LABELS_JA[p.role]}</dd>
          </div>
          <div>
            <dt className="text-gray-500">雇用形態</dt>
            <dd>{EMPLOYMENT_LABELS_JA[p.employment_type]}</dd>
          </div>
          <div>
            <dt className="text-gray-500">電話</dt>
            <dd>{p.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">時給</dt>
            <dd>{p.hourly_wage ? `${p.hourly_wage}円` : "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">週の最低/最大時間</dt>
            <dd>
              {p.min_hours_per_week} / {p.max_hours_per_week}h
            </dd>
          </div>
        </dl>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">希望シフト（週次）</h2>
        <p className="mb-4 text-sm text-gray-500">
          曜日ごとに勤務可能な時間帯と区分を登録します。「不可」を登録するとその時間帯には割り当てられません。
          AIシフト生成は「希望（優先）」を優先的に割り当てます。
        </p>
        <AvailabilityEditor
          staffId={p.id}
          initial={(availability ?? []) as AvailabilityPreference[]}
        />
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">固定シフト（週次の確定パターン）</h2>
        <p className="mb-4 text-sm text-gray-500">
          固定シフト制の運用向け。毎週この曜日はこの時間、というパターンを登録します。
          シフト作成画面の「📌 固定シフトを展開」で、希望休を除いて今月分に一括反映できます。
        </p>
        <FixedShiftEditor
          staffId={p.id}
          initial={(fixedShifts ?? []) as FixedShift[]}
        />
      </div>
    </div>
  );
}
