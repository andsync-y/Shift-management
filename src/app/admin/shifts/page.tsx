import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PERIOD_STATUS_LABELS_JA, type ShiftPeriod } from "@/lib/types";
import PeriodForm from "./PeriodForm";

export default async function ShiftsPage() {
  const supabase = await createClient();
  const { data: periods } = await supabase
    .from("shift_periods")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  const list = (periods as ShiftPeriod[] | null) ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Owner Console</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>
            Shifts
          </h1>
          <p className="sub">シフト作成</p>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>新しいシフト期間</h2>
          <span className="eyebrow">New</span>
        </div>
        <div className="section-body">
          <PeriodForm />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>シフト期間一覧</h2>
          <span className="eyebrow">Periods</span>
        </div>
        <div className="section-body" style={{ paddingTop: 6 }}>
          {list.length > 0 ? (
            <div className="period-list">
              {list.map((p) => {
                const published = p.status === "published";
                const confirmed = p.status === "confirmed";
                return (
                  <div className="period-status" key={p.id}>
                    <Link href={`/admin/shifts/${p.id}`} className="ym en">
                      {p.year}.{String(p.month).padStart(2, "0")}
                    </Link>
                    <Link
                      href={`/admin/shifts/${p.id}`}
                      className="soft"
                      style={{ fontSize: 13 }}
                    >
                      {p.year}年{p.month}月
                    </Link>
                    <span className={`tag${published || confirmed ? " green" : ""}`}>
                      <span
                        className="dot"
                        style={{ background: published || confirmed ? "#3d6b4f" : "var(--ink-3)" }}
                      />
                      {PERIOD_STATUS_LABELS_JA[p.status]}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="help" style={{ marginTop: 0 }}>
              まだシフト期間がありません。上のフォームから作成してください。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
