"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tallyVisitCsv, type VisitTallyResult } from "@/lib/fc-hq/visits-csv";
import { buildNameIndex, matchStaffCounts, ticketCountsFrom, type StaffNameRow } from "@/lib/fc-kpi/match";
import { tallySalonBoardCsv, type SalonBoardResult } from "@/lib/salonboard/accounting-csv";
import { kaisukenBack, NOMINATION_BACK_RATE } from "@/lib/payroll";
import type { FcKpiData } from "@/lib/fc-kpi/types";
import { dispatchKpiSync } from "@/lib/fc-kpi/dispatch";

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

// 月ごとの指名本数を保存（オーナーのみ）。指名バック＝単価×本数 が総支給に加算される。
export async function setNominationCount(
  staffId: string,
  month: string,
  count: number
): Promise<{ ok: boolean; message?: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };
  const n = Math.max(0, Math.round(count) || 0);

  const supabase = await createClient();
  const { error } = await supabase
    .from("nomination_counts")
    .upsert({ staff_id: staffId, month, count: n }, { onConflict: "staff_id,month" });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/payroll");
  return { ok: true };
}

// 月ごとの回数券販売本数を保存（オーナーのみ）。回数券バック＝本数連動の段階単価×本数 が総支給に加算される。
export async function setKaisukenCount(
  staffId: string,
  month: string,
  count: number
): Promise<{ ok: boolean; message?: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };
  const n = Math.max(0, Math.round(count) || 0);

  const supabase = await createClient();
  const { error } = await supabase
    .from("kaisuken_counts")
    .upsert({ staff_id: staffId, month, count: n }, { onConflict: "staff_id,month" });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/payroll");
  return { ok: true };
}

// 月ごとの源泉所得税の手入力（オーナーのみ）。自動計算できない区分の上書き。
// null（空欄）を渡すと削除＝自動計算に戻す。
export async function setIncomeTaxOverride(
  staffId: string,
  month: string,
  amount: number | null
): Promise<{ ok: boolean; message?: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };

  const supabase = await createClient();
  if (amount == null) {
    const { error } = await supabase
      .from("income_tax_overrides")
      .delete()
      .eq("staff_id", staffId)
      .eq("month", month);
    if (error) return { ok: false, message: error.message };
  } else {
    const n = Math.max(0, Math.round(amount) || 0);
    const { error } = await supabase
      .from("income_tax_overrides")
      .upsert({ staff_id: staffId, month, amount: n }, { onConflict: "staff_id,month" });
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/admin/payroll");
  return { ok: true };
}

// ===== 本部KPI（fc_kpi スナップショット）からの一括取込 =====
// 指名数・回数券本数（新規＋更新）を担当別に取り込む。取り込み元は日次スクレイパが
// 保存した当月スナップショット。過去月は月内に取得した分が残っていれば取り込める。

type MonthSnapshot = NonNullable<FcKpiData["month"]>;

// 対象月のKPIを持つ最新スナップショットを取る（過去月は月末頃の取得分が該当）。
async function fetchMonthSnapshot(
  supabase: SupabaseLike,
  month: string
): Promise<MonthSnapshot | null> {
  const { data } = await supabase
    .from("fc_kpi")
    .select("data")
    .eq("data->month->>month", month)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { data?: FcKpiData } | null)?.data?.month as MonthSnapshot | undefined) ?? null;
}

function monthLabel(month: string): string {
  const [y, mo] = month.split("-");
  return `${y}年${Number(mo)}月`;
}

// 今すぐ数字を入れる手段（自動取得を待たなくてよい）。
const KAISUKEN_HINT =
  "　今すぐ入れるなら「📄 来店記録CSVで回数券を取込」、または「店舗KPI」の担当別入力を使ってください。";
const NOMINATION_HINT = "　今すぐ入れるなら「店舗KPI」の担当別入力か、給与表に直接入力してください。";

// スナップショット自体はあるのに項目だけ無い＝その項目に対応する前に取得されたデータ。
// 「日次取得を待て」だけだと永久に入らないので、対応後の取得が要ることを明示する。
function missingFieldMessage(month: string, what: string): string {
  return `${monthLabel(month)}のKPIは取得済みですが、担当別の${what}が入っていません（この項目に対応する前に取得されたデータです）。次回の日次取得から入ります。`;
}

// 当月なら「日次取得がまだ」、過去月なら「遡取得は不可＝手入力で十分」を正しく案内する。
function noSnapshotMessage(month: string, what: string): string {
  const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const currentMonth = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, "0")}`;
  const label = monthLabel(month);
  return month === currentMonth
    ? `本部の${label}の${what}データがまだありません。「店舗KPI」の日次取得の実行後にもう一度お試しください。`
    : `${label}のKPIスナップショットが見つかりませんでした。過去月のデータは本部から遡って取得できないため、${what}は表に直接入力してください（すでに入力済みであればこの取込は不要です）。`;
}

async function fetchNameIndex(supabase: SupabaseLike): Promise<Map<string, string>> {
  const { data } = await supabase.from("profiles").select("id, full_name, display_name").eq("role", "staff");
  return buildNameIndex((data ?? []) as StaffNameRow[]);
}

// 担当別 指名数 → nomination_counts。
export async function applyFcNominations(month: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };
  const supabase = await createClient();

  const m = await fetchMonthSnapshot(supabase, month);
  if (!m) return { ok: false, message: noSnapshotMessage(month, "指名数") + NOMINATION_HINT };
  if (!Array.isArray(m.staffNominations) || m.staffNominations.length === 0) {
    return { ok: false, message: missingFieldMessage(month, "指名数") + NOMINATION_HINT };
  }

  const index = await fetchNameIndex(supabase);
  const { rows, unmatched } = matchStaffCounts(index, m.staffNominations, "件");
  if (rows.length) {
    const { error } = await supabase
      .from("nomination_counts")
      .upsert(rows.map((r) => ({ ...r, month })), { onConflict: "staff_id,month" });
    if (error) return { ok: false, message: `指名数の取込に失敗: ${error.message}` };
  }

  revalidatePath("/admin/payroll");
  const warn = unmatched.length ? `（未一致: ${unmatched.join("・")}）` : "";
  return { ok: true, message: `FCの指名数を ${rows.length}名 取り込みました${warn}。` };
}

// 担当別 新規販売数＋更新販売数 → kaisuken_counts（回数券バックの本数）。
// 来店記録CSVの取込と同じ表に書き込むので、どちらで入れても結果は同じになる。
export async function applyFcKaisuken(month: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };
  const supabase = await createClient();

  const m = await fetchMonthSnapshot(supabase, month);
  if (!m) return { ok: false, message: noSnapshotMessage(month, "回数券販売数") + KAISUKEN_HINT };
  if (!Array.isArray(m.staffTicketSales) || m.staffTicketSales.length === 0) {
    return { ok: false, message: missingFieldMessage(month, "回数券販売数") + KAISUKEN_HINT };
  }

  const { entries, renewalMissing } = ticketCountsFrom(m.staffTicketSales);
  const index = await fetchNameIndex(supabase);
  const { rows, unmatched, total } = matchStaffCounts(index, entries, "本");
  if (rows.length) {
    const { error } = await supabase
      .from("kaisuken_counts")
      .upsert(rows.map((r) => ({ ...r, month })), { onConflict: "staff_id,month" });
    if (error) return { ok: false, message: `回数券本数の取込に失敗: ${error.message}` };
  }

  revalidatePath("/admin/payroll");
  const warn = unmatched.length ? `（未一致: ${unmatched.join("・")}）` : "";
  // 更新が取れていないと本数が不足＝バックの段階単価まで下がるので、黙って通さない。
  const miss = renewalMissing
    ? "　⚠️本部の担当別表から「更新販売数」を取得できていないため新規のみの本数です。来店記録CSVの取込で補ってください。"
    : "";
  return {
    ok: true,
    message: `FCの回数券 計${total}本（新規＋更新）を ${rows.length}名 取り込みました${warn}。${miss}`,
  };
}

// 給与確定ボタン用。指名数と回数券本数をまとめて取り込む。
// 片方だけ取れないこともある（更新販売数の列が無い等）ので、結果は個別に返す。
// kaisukenMissing=true のときは画面側が「本部から今すぐ取得」に進む。
export async function applyFcMonthly(
  month: string
): Promise<{ ok: boolean; message: string; kaisukenMissing: boolean }> {
  const [nom, kais] = await Promise.all([applyFcNominations(month), applyFcKaisuken(month)]);
  return {
    ok: nom.ok || kais.ok,
    message: [nom.message, kais.message].join(" / "),
    kaisukenMissing: !kais.ok,
  };
}

// 本部スクレイパ（GitHub Actions）を今すぐ起動する。
// アプリからは本部システムへ直接アクセスできない（Chromiumが動かない・自動アクセスは
// ランナー側の資格情報で行う）ため、取得は Actions に投げて結果を待つ形になる。
export async function requestFcSync(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const r = await dispatchKpiSync();
  return { ok: r.ok, message: r.message };
}

// 取得完了の判定用。対象月のスナップショットの更新時刻と、回数券販売数の有無を返す。
// 画面側はこれを数秒おきに呼び、updatedAt が変わる（＝新しい取得が入った）のを待つ。
export async function fcSnapshotState(
  month: string
): Promise<{ updatedAt: string | null; hasTicketSales: boolean }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { updatedAt: null, hasTicketSales: false };
  const supabase = await createClient();
  const { data } = await supabase
    .from("fc_kpi")
    .select("updated_at, data")
    .eq("data->month->>month", month)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { updated_at: string; data?: FcKpiData } | null;
  const t = row?.data?.month?.staffTicketSales;
  return { updatedAt: row?.updated_at ?? null, hasTicketSales: Array.isArray(t) && t.length > 0 };
}

// 月別の給与調整（立替精算・臨時手当・貸付返済など）を保存する。
// amount>0=支給 / amount<0=控除 / taxable=false は課税対象から除く（非課税）。
// 金額0かつ摘要なしなら行ごと削除する。
export async function setPayrollAdjustment(
  staffId: string,
  month: string,
  amount: number,
  label: string,
  taxable: boolean
): Promise<{ ok: boolean; message?: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };

  const n = Math.round(amount) || 0;
  const l = label.trim().slice(0, 60);
  const supabase = await createClient();

  if (n === 0 && l === "") {
    const { error } = await supabase
      .from("payroll_adjustments")
      .delete()
      .eq("staff_id", staffId)
      .eq("month", month);
    if (error) return { ok: false, message: error.message };
  } else {
    const { error } = await supabase
      .from("payroll_adjustments")
      .upsert(
        { staff_id: staffId, month, amount: n, label: l || null, taxable },
        { onConflict: "staff_id,month" }
      );
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/admin/payroll");
  return { ok: true };
}

// 本部システムの「来店記録」CSVから、当月の回数券販売本数を担当別に取り込む。
// 手入力していた回数券本数を置き換える（CSVに出てくる担当は0本でも0で上書きする）。
// CSVはブラウザ側で読んで文字列で渡す（本部システムへ直接アクセスはしない）。
export async function importKaisukenFromVisitCsv(
  month: string,
  csvText: string
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };
  if (!csvText.trim()) return { ok: false, message: "CSVが空です。" };

  let tally: VisitTallyResult;
  try {
    tally = tallyVisitCsv(csvText, month);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "CSVの解析に失敗しました。" };
  }

  const label = monthLabel(month);
  if (tally.monthRows === 0) {
    const has = tally.monthsInCsv.length ? `（このCSVに入っているのは ${tally.monthsInCsv.join("・")}）` : "";
    return { ok: false, message: `${label}の来店記録がCSVにありません${has}。本部システムで期間を変えて出力してください。` };
  }

  const supabase = await createClient();
  const index = await fetchNameIndex(supabase);
  const { rows, unmatched } = matchStaffCounts(
    index,
    tally.tallies.map((t) => ({ name: t.staff, count: t.kaisuken })),
    "本"
  );
  if (rows.length) {
    const { error } = await supabase
      .from("kaisuken_counts")
      .upsert(rows.map((r) => ({ ...r, month })), { onConflict: "staff_id,month" });
    if (error) return { ok: false, message: `取込に失敗: ${error.message}` };
  }

  revalidatePath("/admin/payroll");
  const warn = unmatched.length
    ? `／スタッフ名が一致せず取り込めなかった担当: ${unmatched.join("・")}（表示名を本部の表記に合わせてください）`
    : "";
  return {
    ok: true,
    message: `${label}の回数券 計${tally.totalKaisuken}本を ${rows.length}名 に取り込みました（来店${tally.monthRows}件）${warn}。`,
  };
}

// ===== サロンボードとの突合 =====
// 給与のバックは本部システム(zn-stretch)の担当別売上＝スタッフの手入力から取り込んでいる。
// サロンボードは実際の会計そのものなので、給与を締める前にこちらと突き合わせる。
// バック合計で¥19万規模になる項目なので、手入力の誤りはそのまま金銭の誤りになる。

export interface SalonBoardDiffRow {
  staff: string; // サロンボードの担当名
  matched: boolean; // アプリのスタッフと突合できたか
  salonNomination: number;
  storedNomination: number;
  salonKaisuken: number;
  storedKaisuken: number;
  /** サロンボードの数字で計算し直したときのバック差額（＋なら支給不足） */
  backDiff: number;
  visits: number;
  newVisits: number;
}

export interface SalonBoardCompareResult {
  ok: boolean;
  message: string;
  rows?: SalonBoardDiffRow[];
  totalBackDiff?: number;
  canceledAccounts?: number;
}

function backFor(nomination: number, kaisuken: number): number {
  return NOMINATION_BACK_RATE * nomination + kaisukenBack(kaisuken);
}

/** サロンボードCSVと、いまアプリに入っている指名数・回数券本数を突き合わせる（書き込みなし）。 */
export async function compareSalonBoard(
  month: string,
  csvText: string
): Promise<SalonBoardCompareResult> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };
  if (!csvText.trim()) return { ok: false, message: "CSVが空です。" };

  let tally: SalonBoardResult;
  try {
    tally = tallySalonBoardCsv(csvText, month);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "CSVの解析に失敗しました。" };
  }
  const label = monthLabel(month);
  if (tally.monthRows === 0) {
    const has = tally.monthsInCsv.length ? `（このCSVに入っているのは ${tally.monthsInCsv.join("・")}）` : "";
    return { ok: false, message: `${label}の会計データがCSVにありません${has}。` };
  }

  const supabase = await createClient();
  const index = await fetchNameIndex(supabase);
  const [{ data: nomRaw }, { data: kaisRaw }] = await Promise.all([
    supabase.from("nomination_counts").select("staff_id, count").eq("month", month),
    supabase.from("kaisuken_counts").select("staff_id, count").eq("month", month),
  ]);
  const nom = new Map(((nomRaw as { staff_id: string; count: number }[] | null) ?? []).map((r) => [r.staff_id, r.count]));
  const kais = new Map(((kaisRaw as { staff_id: string; count: number }[] | null) ?? []).map((r) => [r.staff_id, r.count]));

  const rows: SalonBoardDiffRow[] = tally.tallies.map((t) => {
    const id = index.get(t.staff);
    const storedNomination = id ? nom.get(id) ?? 0 : 0;
    const storedKaisuken = id ? kais.get(id) ?? 0 : 0;
    return {
      staff: t.staff,
      matched: !!id,
      salonNomination: t.nominations,
      storedNomination,
      salonKaisuken: t.kaisuken,
      storedKaisuken,
      backDiff: backFor(t.nominations, t.kaisuken) - backFor(storedNomination, storedKaisuken),
      visits: t.visits,
      newVisits: t.newVisits,
    };
  });
  const totalBackDiff = rows.reduce((s, r) => s + r.backDiff, 0);
  const diffCount = rows.filter((r) => r.backDiff !== 0).length;

  return {
    ok: true,
    message:
      diffCount === 0
        ? `${label}：サロンボードと一致しました（${rows.length}名・来店${tally.tallies.reduce((s, t) => s + t.visits, 0)}件）。`
        : `${label}：${diffCount}名に差異があります。バック差額 ${totalBackDiff >= 0 ? "+" : ""}¥${totalBackDiff.toLocaleString()}。`,
    rows,
    totalBackDiff,
    canceledAccounts: tally.canceledAccounts,
  };
}

/** 突合結果をサロンボードの数字で上書きする（指名数・回数券本数）。 */
export async function applySalonBoard(
  month: string,
  csvText: string
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, message: "月の形式が不正です。" };

  let tally: SalonBoardResult;
  try {
    tally = tallySalonBoardCsv(csvText, month);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "CSVの解析に失敗しました。" };
  }
  if (tally.monthRows === 0) return { ok: false, message: `${monthLabel(month)}の会計データがCSVにありません。` };

  const supabase = await createClient();
  const index = await fetchNameIndex(supabase);
  const nomMatch = matchStaffCounts(index, tally.tallies.map((t) => ({ name: t.staff, count: t.nominations })), "件");
  const kaisMatch = matchStaffCounts(index, tally.tallies.map((t) => ({ name: t.staff, count: t.kaisuken })), "本");

  if (nomMatch.rows.length) {
    const { error } = await supabase
      .from("nomination_counts")
      .upsert(nomMatch.rows.map((r) => ({ ...r, month })), { onConflict: "staff_id,month" });
    if (error) return { ok: false, message: `指名数の反映に失敗: ${error.message}` };
  }
  if (kaisMatch.rows.length) {
    const { error } = await supabase
      .from("kaisuken_counts")
      .upsert(kaisMatch.rows.map((r) => ({ ...r, month })), { onConflict: "staff_id,month" });
    if (error) return { ok: false, message: `回数券本数の反映に失敗: ${error.message}` };
  }

  revalidatePath("/admin/payroll");
  const warn = nomMatch.unmatched.length ? `（未一致: ${nomMatch.unmatched.join("・")}）` : "";
  return {
    ok: true,
    message: `サロンボードの数字を ${nomMatch.rows.length}名 に反映しました（指名${nomMatch.total}件 / 回数券${kaisMatch.total}本）${warn}。`,
  };
}
