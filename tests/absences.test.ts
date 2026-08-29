import test from "node:test";
import assert from "node:assert/strict";
import {
  tallyAbsences,
  filterByMonth,
  absenceRate,
  ABSENCE_KIND_LABELS_JA,
  COUNTED_AS_ABSENCE,
  type AbsenceKind,
} from "@/lib/absences";

const row = (staff_id: string, kind: AbsenceKind, absence_date = "2026-09-01") => ({
  staff_id,
  kind,
  absence_date,
});

test("区分ごとに数える", () => {
  const t = tallyAbsences([
    row("a", "absent"),
    row("a", "late"),
    row("a", "absent", "2026-09-05"),
    row("b", "no_show"),
  ]);
  assert.equal(t.get("a")!.byKind.absent, 2);
  assert.equal(t.get("a")!.byKind.late, 1);
  assert.equal(t.get("a")!.total, 3);
  assert.equal(t.get("b")!.byKind.no_show, 1);
});

test("欠勤数に遅刻・早退は入れない", () => {
  const t = tallyAbsences([
    row("a", "absent"),
    row("a", "no_show"),
    row("a", "late"),
    row("a", "early_leave"),
  ]).get("a")!;
  assert.equal(t.absences, 2); // 欠勤＋無断欠勤のみ
  assert.equal(t.lateness, 2); // 遅刻＋早退
  assert.equal(t.total, 4);
});

test("記録が無いスタッフは結果に現れない", () => {
  assert.equal(tallyAbsences([]).size, 0);
  assert.equal(tallyAbsences([row("a", "absent")]).get("b"), undefined);
});

test("対象月だけに絞る", () => {
  const rows = [
    row("a", "absent", "2026-08-31"),
    row("a", "absent", "2026-09-01"),
    row("a", "absent", "2026-09-30"),
    row("a", "absent", "2026-10-01"),
  ];
  assert.equal(filterByMonth(rows, "2026-09").length, 2);
});

test("欠勤率＝欠勤÷シフト日数。分母0なら0", () => {
  assert.equal(absenceRate(2, 20), 0.1);
  assert.equal(absenceRate(0, 20), 0);
  assert.equal(absenceRate(3, 0), 0); // ゼロ除算しない
  assert.equal(absenceRate(5, 5), 1);
});

test("区分のラベルが全部そろっている", () => {
  const kinds: AbsenceKind[] = ["absent", "no_show", "late", "early_leave"];
  for (const k of kinds) assert.ok(ABSENCE_KIND_LABELS_JA[k]);
  assert.deepEqual(COUNTED_AS_ABSENCE, ["absent", "no_show"]);
});
