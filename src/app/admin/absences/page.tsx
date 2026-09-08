import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Absence } from "@/lib/absences";
import AbsenceManager from "./AbsenceManager";

export const dynamic = "force-dynamic";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// 欠勤・遅刻・早退の記録。スタッフからLINEで連絡が来たものをオーナーがここに残す。
export default async function AbsencesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "")
    ? sp.month!
    : `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}`;
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${pad(m)}-01`;
  const end = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;

  const supabase = await createClient();
  const [{ data: staff }, { data: absences }, { data: shifts }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, display_name")
      .eq("role", "staff")
      .eq("is_active", true)
      .order("full_name"),
    supabase.from("absences").select("*").order("absence_date", { ascending: false }).limit(200),
    // 欠勤率の分母＝その月に入っていたシフトの日数
    supabase.from("shifts").select("staff_id, work_date").gte("work_date", start).lte("work_date", end),
  ]);

  const scheduledDays: Record<string, number> = {};
  const seen = new Set<string>();
  for (const s of (shifts ?? []) as { staff_id: string; work_date: string }[]) {
    const key = `${s.staff_id}_${s.work_date}`;
    if (seen.has(key)) continue; // 同じ日に2枠あっても1日と数える
    seen.add(key);
    scheduledDays[s.staff_id] = (scheduledDays[s.staff_id] ?? 0) + 1;
  }

  const prev = `${m === 1 ? y - 1 : y}-${pad(m === 1 ? 12 : m - 1)}`;
  const next = `${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}`;

  return (
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Attendance</div>
          <h1 className="ttl en">Absences</h1>
          <p className="sub">欠勤・遅刻・早退の記録 — LINEで連絡を受けたらここに残す</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <a className="btn-outline" href={`/admin/absences?month=${prev}`}>
            ← 前月
          </a>
          <form method="get" style={{ display: "flex", gap: 8 }}>
            <input type="month" name="month" defaultValue={month} className="input en" style={{ width: 160 }} />
            <button type="submit" className="btn-outline">
              表示
            </button>
          </form>
          <a className="btn-outline" href={`/admin/absences?month=${next}`}>
            翌月 →
          </a>
        </div>
      </div>

      <AbsenceManager
        staff={(staff ?? []) as { id: string; full_name: string; display_name: string | null }[]}
        absences={(absences ?? []) as Absence[]}
        month={month}
        scheduledDays={scheduledDays}
      />
    </div>
  );
}
