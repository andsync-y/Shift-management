// 欠勤記録の区分と集計。画面・テストで共用する純粋関数。

export type AbsenceKind = "absent" | "no_show" | "late" | "early_leave";

export const ABSENCE_KIND_LABELS_JA: Record<AbsenceKind, string> = {
  absent: "欠勤",
  no_show: "無断欠勤",
  late: "遅刻",
  early_leave: "早退",
};

/** 表示順（重い順）。集計の列順もこれに合わせる。 */
export const ABSENCE_KINDS: AbsenceKind[] = ["no_show", "absent", "late", "early_leave"];

/**
 * 「欠勤」として数える区分。
 * 遅刻・早退は出勤しているので欠勤数には含めない（別列で見る）。
 */
export const COUNTED_AS_ABSENCE: AbsenceKind[] = ["absent", "no_show"];

export interface Absence {
  id: string;
  staff_id: string;
  absence_date: string; // "YYYY-MM-DD"
  kind: AbsenceKind;
  reason: string | null;
  note: string | null;
  reported_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AbsenceTally {
  staffId: string;
  /** 区分ごとの件数 */
  byKind: Record<AbsenceKind, number>;
  /** 欠勤＋無断欠勤の合計 */
  absences: number;
  /** 遅刻＋早退の合計 */
  lateness: number;
  total: number;
}

function emptyByKind(): Record<AbsenceKind, number> {
  return { absent: 0, no_show: 0, late: 0, early_leave: 0 };
}

/** スタッフ別に集計する。1件も無い人は結果に出ない（呼び出し側で0埋めする）。 */
export function tallyAbsences(rows: Pick<Absence, "staff_id" | "kind">[]): Map<string, AbsenceTally> {
  const map = new Map<string, AbsenceTally>();
  for (const r of rows) {
    let t = map.get(r.staff_id);
    if (!t) {
      t = { staffId: r.staff_id, byKind: emptyByKind(), absences: 0, lateness: 0, total: 0 };
      map.set(r.staff_id, t);
    }
    t.byKind[r.kind] = (t.byKind[r.kind] ?? 0) + 1;
    if (COUNTED_AS_ABSENCE.includes(r.kind)) t.absences += 1;
    else t.lateness += 1;
    t.total += 1;
  }
  return map;
}

/** 対象月("YYYY-MM")の行だけに絞る。 */
export function filterByMonth<T extends { absence_date: string }>(rows: T[], month: string): T[] {
  return rows.filter((r) => r.absence_date.slice(0, 7) === month);
}

/**
 * 出勤予定日数に対する欠勤率(0-1)。予定が0なら0を返す。
 * 「何日入っていたうち何日休んだか」なので、分母はシフトの日数。
 */
export function absenceRate(absences: number, scheduledDays: number): number {
  if (scheduledDays <= 0) return 0;
  return absences / scheduledDays;
}
