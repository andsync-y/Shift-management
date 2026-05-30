import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PERIOD_STATUS_LABELS_JA, type ShiftPeriod } from "@/lib/types";
import PeriodForm from "./PeriodForm";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  published: "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
};

export default async function ShiftsPage() {
  const supabase = await createClient();
  const { data: periods } = await supabase
    .from("shift_periods")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">シフト作成</h1>

      <div className="card">
        <h2 className="mb-4 font-semibold">新しいシフト期間</h2>
        <PeriodForm />
      </div>

      <div className="card">
        <h2 className="mb-4 font-semibold">シフト期間一覧</h2>
        <ul className="divide-y divide-gray-100">
          {(periods as ShiftPeriod[] | null)?.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-3">
              <Link href={`/admin/shifts/${p.id}`} className="font-medium hover:text-brand">
                {p.year}年{p.month}月
              </Link>
              <span className={`badge ${STATUS_STYLE[p.status]}`}>
                {PERIOD_STATUS_LABELS_JA[p.status]}
              </span>
            </li>
          ))}
          {(!periods || periods.length === 0) && (
            <li className="py-4 text-center text-gray-400">
              まだシフト期間がありません。上のフォームから作成してください。
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
