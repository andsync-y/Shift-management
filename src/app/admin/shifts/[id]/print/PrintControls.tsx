"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// 印刷ページの操作バー（印刷時は非表示）。月/週の切替・週の開始日・印刷ボタン。
export default function PrintControls({
  periodId,
  view,
  start,
  monthStart,
  monthEnd,
}: {
  periodId: string;
  view: "month" | "week";
  start: string;
  monthStart: string;
  monthEnd: string;
}) {
  const router = useRouter();
  const base = `/admin/shifts/${periodId}/print`;

  return (
    <div className="print-controls no-print">
      <Link href={`/admin/shifts/${periodId}`} className="btn-outline">
        ← 戻る
      </Link>
      <span className="seg" role="tablist">
        <Link href={`${base}?view=month`} className={view === "month" ? "on" : ""}>
          1か月
        </Link>
        <Link href={`${base}?view=week&start=${start}`} className={view === "week" ? "on" : ""}>
          1週間
        </Link>
      </span>
      {view === "week" && (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          開始日
          <input
            type="date"
            className="input en"
            value={start}
            min={monthStart}
            max={monthEnd}
            onChange={(e) => {
              if (e.target.value) router.push(`${base}?view=week&start=${e.target.value}`);
            }}
            style={{ width: 150 }}
          />
        </label>
      )}
      <button className="btn-fill" onClick={() => window.print()}>
        🖨 印刷
      </button>
      <span className="help" style={{ margin: 0 }}>
        {view === "month" ? "横向き(A4 Landscape)推奨" : "縦/横どちらでも可"}
      </span>
    </div>
  );
}
