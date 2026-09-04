import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { PayrollAdjustment, Profile, TimeRecord } from "@/lib/types";
import { displayName } from "@/lib/display-name";
import { hhmm, NOMINATION_BACK_RATE } from "@/lib/payroll";
import { TAX_COLUMN_LABELS_JA } from "@/lib/deductions";
import { computeStaffPayroll, groupRecordsByStaff } from "@/lib/compute-staff-payroll";
import NominationInput from "./NominationInput";
import KaisukenInput from "./KaisukenInput";
import TaxInput from "./TaxInput";
import AdjustmentInput from "./AdjustmentInput";
import TransferPanel from "./TransferPanel";
import FinalizeButton from "./FinalizeButton";
import KaisukenCsvImport from "./KaisukenCsvImport";
import SendPayslipsButton from "./SendPayslipsButton";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function jstYearMonth(): string {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}`;
}
const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const weeklyHours = (min: number) => (min / 60).toFixed(1);

interface ShahoJudge {
  hours: number; // 判定に使った週時間
  usingContract: boolean; // true=所定労働時間 / false=実績週平均で代用
  enrolled: boolean; // 実際に加入しているか（profiles.shaho_enrolled＝給与から控除される）
  shouldEnroll: boolean; // 週30時間以上＝本来は加入対象か
  label: string;
  cls: string; // バッジ用クラス（late=注意）
}

// 社会保険の状態。「実際に加入しているか」と「週30時間で加入対象か」は別物なので分けて返す。
//
// ⚠️ 給与から社保を引くかどうかは profiles.shaho_enrolled だけで決まる（computeDeductions）。
//    週30時間の判定は“目安”であって、控除には影響しない。以前ここが時間だけを見ていたため、
//    所定労働時間を入れた人だけが「社保」と表示され、実際の加入者3名に何も出ない状態になっていた。
function shahoJudge(
  contractedHrs: number | null,
  actualAvgMin: number,
  enrolled: boolean
): ShahoJudge {
  const usingContract = contractedHrs != null && contractedHrs > 0;
  const hours = usingContract ? contractedHrs! : actualAvgMin / 60;
  const shouldEnroll = hours >= 30;
  if (enrolled) {
    return { hours, usingContract, enrolled, shouldEnroll, label: "加入中", cls: "early" };
  }
  if (shouldEnroll) {
    return { hours, usingContract, enrolled, shouldEnroll, label: "要検討（30h以上）", cls: "late" };
  }
  return { hours, usingContract, enrolled, shouldEnroll, label: "対象外", cls: "" };
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : jstYearMonth();
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${pad(m)}-01`;
  const end = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;

  const supabase = await createClient();
  const [{ data: recordsRaw }, { data: staffRaw }, { data: nomRaw }, { data: kaisRaw }, { data: taxRaw }, { data: adjRaw }] = await Promise.all([
    supabase.from("time_records").select("*").gte("work_date", start).lte("work_date", end),
    supabase.from("profiles").select("*").eq("role", "staff").eq("is_active", true).order("full_name"),
    supabase.from("nomination_counts").select("staff_id, count").eq("month", month),
    supabase.from("kaisuken_counts").select("staff_id, count").eq("month", month),
    supabase.from("income_tax_overrides").select("staff_id, amount").eq("month", month),
    supabase.from("payroll_adjustments").select("staff_id, amount, label, taxable").eq("month", month),
  ]);

  const staff = (staffRaw as Profile[] | null) ?? [];
  const records = (recordsRaw as TimeRecord[] | null) ?? [];
  const nomCounts = new Map(
    ((nomRaw as { staff_id: string; count: number }[] | null) ?? []).map((r) => [r.staff_id, r.count])
  );
  const kaisCounts = new Map(
    ((kaisRaw as { staff_id: string; count: number }[] | null) ?? []).map((r) => [r.staff_id, r.count])
  );
  const adjustments = new Map(
    ((adjRaw as PayrollAdjustment[] | null) ?? []).map((r) => [
      r.staff_id,
      { amount: r.amount, label: r.label, taxable: r.taxable },
    ])
  );
  const taxOverrides = new Map(
    ((taxRaw as { staff_id: string; amount: number }[] | null) ?? []).map((r) => [r.staff_id, r.amount])
  );
  const byStaff = groupRecordsByStaff(records);

  const rows = staff
    .map((s) => {
      const count = nomCounts.get(s.id) ?? 0;
      const kaisCount = kaisCounts.get(s.id) ?? 0;
      // 給与の計算は computeStaffPayroll に集約（画面・PDF・振込で同じ結果になるように）
      const { pay, nominationBack, kaisukenBackYen, adjustment, adjustmentLabel, gross: grossTotal, deduction: ded } =
        computeStaffPayroll({
          staff: s,
          records: byStaff.get(s.id) ?? [],
          nominationCount: count,
          kaisukenCount: kaisCount,
          taxOverride: taxOverrides.get(s.id) ?? null,
          adjustment: adjustments.get(s.id) ?? null,
        });
      const rate = NOMINATION_BACK_RATE;
      return {
        staff: s,
        pay,
        rate,
        count,
        nominationBack,
        kaisCount,
        kaisukenBackYen,
        adjustment,
        adjustmentLabel,
        grossTotal,
        ded,
      };
    })
    .filter(
      (r) => r.pay.workedMin > 0 || r.pay.openCount > 0 || r.count > 0 || r.kaisCount > 0 || r.adjustment !== 0
    );

  const totalGross = rows.reduce((sum, r) => sum + r.grossTotal, 0);
  const totalNet = rows.reduce((sum, r) => sum + r.ded.net, 0);

  // 振込（全銀）対象：口座情報が揃っていて差引支給>0 のスタッフ。振込額は手取り。
  const bankReady = (s: Profile) => !!(s.bank_code && s.branch_code && s.account_number && s.recipient_kana);
  const transferRows = rows.filter((r) => r.ded.net > 0 && bankReady(r.staff));
  const transferTotal = transferRows.reduce((s, r) => s + r.ded.net, 0);
  const missingBank = rows.filter((r) => r.ded.net > 0 && !bankReady(r.staff)).map((r) => displayName(r.staff));
  const monthEndDate = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
  // 振込指定日の初期値: 対象月の月末。ただし過去日は銀行が受け付けないため、
  // 月末が過ぎている（過去月の給与を翌月に払う）場合は今日(JST)にする。
  const todayJst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const defaultTransferDate = monthEndDate < todayJst ? todayJst : monthEndDate;

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div className="masthead">
          <div className="eyebrow accent">Owner Console</div>
          <h1 className="ttl en" style={{ marginTop: 12 }}>
            Payroll
          </h1>
          <p className="sub">
            給与計算（実打刻ベース）— {y}年{m}月
          </p>
        </div>
        <div className="month-nav">
          <a className="btn-outline" href={`/admin/payroll?month=${prev}`}>
            ← 前月
          </a>
          <form method="get" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="month" name="month" defaultValue={month} className="input en" style={{ width: 160 }} />
            <button type="submit" className="btn-outline">
              表示
            </button>
          </form>
          <a className="btn-outline" href={`/admin/payroll?month=${next}`}>
            翌月 →
          </a>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>スタッフ別 給与</h2>
          <span style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <FinalizeButton month={month} />
            <KaisukenCsvImport month={month} />
            <a className="btn-outline" style={{ fontSize: 12.5, padding: "7px 12px" }} href={`/admin/payroll/print?month=${month}`}>
              🖨 給与明細を印刷
            </a>
            <span className="eyebrow">総支給合計 {yen(totalGross)}</span>
          </span>
        </div>
        <div className="section-body" style={{ overflowX: "auto", paddingTop: 10 }}>
          {rows.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>
              この月の打刻記録はありません。
            </p>
          ) : (
            <table className="staff-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>スタッフ</th>
                  <th style={{ textAlign: "right" }}>拘束</th>
                  <th style={{ textAlign: "right" }}>実働</th>
                  <th style={{ textAlign: "right" }}>週平均</th>
                  <th style={{ textAlign: "right" }}>うち残業</th>
                  <th style={{ textAlign: "right" }}>うち深夜</th>
                  <th style={{ textAlign: "right" }}>時給</th>
                  <th style={{ textAlign: "right" }}>基本</th>
                  <th style={{ textAlign: "right" }}>残業割増</th>
                  <th style={{ textAlign: "right" }}>深夜割増</th>
                  <th style={{ textAlign: "right" }}>交通費</th>
                  <th style={{ textAlign: "right" }}>指名本数</th>
                  <th style={{ textAlign: "right" }}>指名バック</th>
                  <th style={{ textAlign: "right" }}>回数券本数</th>
                  <th style={{ textAlign: "right" }}>回数券バック</th>
                  <th style={{ textAlign: "right" }}>調整（金額・摘要・区分）</th>
                  <th style={{ textAlign: "right" }}>総支給</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ staff: s, pay, count, nominationBack, kaisCount, kaisukenBackYen, adjustment, adjustmentLabel, grossTotal }) => (
                  <tr key={s.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className="dot" style={{ background: s.display_color, marginRight: 6 }} />
                      {displayName(s)}
                      {pay.openCount > 0 && (
                        <span className="mk late" style={{ marginLeft: 6 }}>
                          打刻中{pay.openCount}
                        </span>
                      )}
                    </td>
                    <td className="en muted" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{hhmm(pay.clockedMin)}</td>
                    <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{hhmm(pay.workedMin)}</td>
                    <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {weeklyHours(pay.avgWeeklyMin)}h
                      {(() => {
                        const j = shahoJudge(
                          s.contracted_weekly_hours ?? null,
                          pay.avgWeeklyMin,
                          s.shaho_enrolled ?? false
                        );
                        return j.cls ? (
                          <span
                            className={`mk ${j.cls}`}
                            style={{ marginLeft: 6 }}
                            title={`社保: ${j.label}（${j.usingContract ? "所定" : "実績"} ${j.hours.toFixed(1)}h/週）`}
                          >
                            {j.enrolled ? "社保" : "30h"}
                          </span>
                        ) : null;
                      })()}
                    </td>
                    <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{hhmm(pay.overtimeMin)}</td>
                    <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{hhmm(pay.nightMin)}</td>
                    <td className="muted" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {(() => {
                        const ws = [...new Set(pay.days.map((d) => d.wage))].filter((w) => w > 0);
                        return ws.length === 0 ? "—" : ws.map((w) => yen(w)).join(" / ");
                      })()}
                    </td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(pay.basePay)}</td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(pay.overtimePay)}</td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(pay.nightPay)}</td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(pay.commute)}</td>
                    <td style={{ textAlign: "right" }}>
                      <NominationInput staffId={s.id} month={month} initial={count} />
                    </td>
                    <td className="en" style={{ textAlign: "right" }}>
                      {nominationBack > 0 ? yen(nominationBack) : <span className="muted">—</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <KaisukenInput staffId={s.id} month={month} initial={kaisCount} />
                    </td>
                    <td className="en" style={{ textAlign: "right" }}>
                      {kaisukenBackYen > 0 ? yen(kaisukenBackYen) : <span className="muted">—</span>}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <AdjustmentInput
                        staffId={s.id}
                        month={month}
                        initialAmount={adjustment}
                        initialLabel={adjustmentLabel ?? ""}
                        initialTaxable={adjustments.get(s.id)?.taxable ?? true}
                      />
                    </td>
                    <td className="en" style={{ textAlign: "right", fontWeight: 700 }}>{yen(grossTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="help" style={{ marginBottom: 0 }}>
拘束＝出勤〜退勤の合計（休憩控除前・勤怠管理と一致）／実働＝休憩控除後（賃金の元）。
            休憩自動控除（実働8h超→60分／6h超→45分）・<strong>賃金は1分単位で計算（丸めなし）</strong>・残業1.25倍（1日8h超）・深夜22:00〜5:00を25%加算で計算。
            時給は期間別（6/8〜6/19は¥1,060／6/20〜は¥1,600フロア・全員一律／80万超の売上連動UPは売上接続後に反映）、範囲外は各自の時給。
            交通費は片道距離(km)から自動計算（「スタッフ管理」で設定）。控除（源泉・雇用保険・社保）と手取りは下の「控除・差引支給」を参照。
            <strong>指名バック＝指名本数×3,000円（税抜・固定）</strong>を総支給に加算（本数はこの表で入力＝自動保存）。
            <strong>調整</strong>は立替精算・臨時手当・貸付返済などの増減（プラス=支給／マイナス=控除）。
            摘要は給与明細に印字。<strong>非課税</strong>を選ぶと交通費と同じく課税対象から外れます（立替金の精算など）。
            <strong>回数券バック＝本数連動（1〜3本¥1,000／4〜7本¥2,000／8本〜¥3,000）×本数</strong>を加算。
            本数は本部システムの<strong>「来店記録」CSV</strong>を上の「来店記録CSVで回数券を取込」に読ませると担当別に自動集計されます（この表で手直しも可）。
          </p>
          <p className="help" style={{ marginTop: 6, marginBottom: 0 }}>
            <strong>週平均</strong>は月内の各週（月〜日）の実働合計の平均（実績）。社保加入の目安は下の「社会保険 加入判定」を参照。
          </p>
        </div>
      </div>

      {/* 控除 → 差引支給（手取り） */}
      {rows.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>控除・差引支給（手取り）</h2>
            <span style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <SendPayslipsButton month={month} count={rows.length} />
              <a className="btn-outline" style={{ fontSize: 12.5, padding: "7px 12px" }} href={`/api/payroll/payslips?month=${month}`}>
                📄 全員分PDF
              </a>
              <span className="eyebrow">手取り合計 {yen(totalNet)}</span>
            </span>
          </div>
          <div className="section-body" style={{ overflowX: "auto", paddingTop: 10 }}>
            <table className="staff-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>スタッフ</th>
                  <th>税区分</th>
                  <th style={{ textAlign: "right" }}>総支給</th>
                  <th style={{ textAlign: "right" }}>課税対象</th>
                  <th style={{ textAlign: "right" }}>雇用保険</th>
                  <th style={{ textAlign: "right" }}>健康保険</th>
                  <th style={{ textAlign: "right" }}>厚生年金</th>
                  <th style={{ textAlign: "right" }}>源泉所得税</th>
                  <th style={{ textAlign: "right" }}>差引支給</th>
                  <th>明細</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ staff: s, ded, grossTotal }) => (
                  <tr key={s.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className="dot" style={{ background: s.display_color, marginRight: 6 }} />
                      {displayName(s)}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className={`mk ${(s.tax_column ?? "otsu") === "otsu" ? "late" : ""}`} title={TAX_COLUMN_LABELS_JA[s.tax_column ?? "otsu"]}>
                        {(s.tax_column ?? "otsu") === "kou" ? `甲${(s.dependents_count ?? 0) > 0 ? `・扶${s.dependents_count}` : ""}` : "乙"}
                      </span>
                    </td>
                    <td className="en" style={{ textAlign: "right" }}>{yen(grossTotal)}</td>
                    <td className="en muted" style={{ textAlign: "right" }}>{yen(ded.taxableBase)}</td>
                    <td className="en" style={{ textAlign: "right" }}>{ded.empInsurance ? `−${yen(ded.empInsurance)}` : <span className="muted">—</span>}</td>
                    <td className="en" style={{ textAlign: "right" }}>{ded.healthInsurance ? `−${yen(ded.healthInsurance)}` : <span className="muted">—</span>}</td>
                    <td className="en" style={{ textAlign: "right" }}>{ded.pension ? `−${yen(ded.pension)}` : <span className="muted">—</span>}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <TaxInput staffId={s.id} month={month} initial={taxOverrides.get(s.id) ?? null} auto={ded.incomeTaxAuto} />
                      {taxOverrides.has(s.id) && (
                        <span className="mk" style={{ marginLeft: 4 }} title={`手入力で上書き中（自動計算は ${yen(ded.incomeTaxAuto)}）。空欄に戻すと自動に復帰。`}>上書</span>
                      )}
                    </td>
                    <td className="en" style={{ textAlign: "right", fontWeight: 700 }}>{yen(ded.net)}</td>
                    <td>
                      <a className="btn-mini" href={`/api/payroll/payslips?month=${month}&staff=${s.id}`} title="この人の給与明細PDFをダウンロード">
                        PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="help" style={{ marginBottom: 0 }}>
              <strong>税区分</strong>：甲＝扶養控除等申告書を当店に提出済み／乙＝未提出（他社が本業のダブルワーク等）。「スタッフ管理」で設定。
              <strong>源泉所得税</strong>は<strong>令和8年分 税額表（月額表・甲欄/乙欄・扶養数対応）で自動計算</strong>。
              個別事情があるときだけ手入力で上書き（入力があれば常に優先・空欄に戻すと自動に復帰）。
              <strong>雇用保険</strong>＝総支給×0.5%（交通費込・50銭以下切捨/超切上）。<strong>社会保険</strong>は加入設定したスタッフのみ、
              当月報酬から標準報酬月額を求める簡易方式（本来は資格取得時・定時決定で固定＝目安。健保料率は協会けんぽ岐阜の当年度告示に要更新）。
              差引支給（手取り）＝総支給−雇用保険−社保−源泉。
            </p>
          </div>
        </div>
      )}

      {/* 給与振込（全銀フォーマット） */}
      {rows.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>給与振込データ（全銀フォーマット）</h2>
            <span className="eyebrow">SMBC 総合振込</span>
          </div>
          <TransferPanel
            month={month}
            defaultDate={defaultTransferDate}
            count={transferRows.length}
            total={transferTotal}
            missing={missingBank}
          />
        </div>
      )}

      {/* 社会保険 加入判定（所定労働時間ベース＋¥8.8万チェック） */}
      {rows.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>社会保険 加入判定</h2>
            <span className="eyebrow">目安</span>
          </div>
          <div className="section-body" style={{ overflowX: "auto", paddingTop: 10 }}>
            <table className="staff-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>スタッフ</th>
                  <th style={{ textAlign: "right" }}>週所定</th>
                  <th style={{ textAlign: "right" }}>実績週平均</th>
                  <th>加入状況</th>
                  <th>判定</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ staff: s, pay }) => {
                  const j = shahoJudge(
                    s.contracted_weekly_hours ?? null,
                    pay.avgWeeklyMin,
                    s.shaho_enrolled ?? false
                  );
                  return (
                    <tr key={s.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className="dot" style={{ background: s.display_color, marginRight: 6 }} />
                        {displayName(s)}
                      </td>
                      <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {s.contracted_weekly_hours != null ? (
                          `${s.contracted_weekly_hours.toFixed(1)}h`
                        ) : (
                          <span className="muted">未設定</span>
                        )}
                      </td>
                      <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {weeklyHours(pay.avgWeeklyMin)}h
                        {!j.usingContract && (
                          <span className="mk" style={{ marginLeft: 6 }} title="所定労働時間が未設定のため実績で代用判定">代用</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {j.enrolled ? (
                          <span className="mk early">加入中</span>
                        ) : (
                          <span className="muted">未加入</span>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className={`mk ${j.cls}`}>{j.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="help" style={{ marginBottom: 0 }}>
              <strong>週所定</strong>＝契約上の週の所定労働時間（「スタッフ管理」で設定。未設定なら実績週平均で<span className="mk" style={{ margin: "0 3px" }}>代用</span>）。
              <strong>加入状況</strong>＝スタッフ管理の「社会保険 加入」設定。<strong>給与から社保を引くかどうかはこれだけで決まります</strong>。
              <span className="mk late" style={{ margin: "0 4px" }}>要検討（30h以上）</span>は週30時間を超えているのに未加入という意味で、控除には影響しません。
              加入・脱退の切り替えは<strong>その月の給与を締めてから</strong>行ってください（設定は月別ではないため、遡って全月に効きます）。
              最終判断は社労士等にご確認ください。
            </p>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="section">
          <div className="section-head">
            <h2>日別の明細</h2>
            <span className="eyebrow">名前をタップで展開</span>
          </div>
          <div className="section-body">
            {rows.map(({ staff: s, pay, grossTotal, ded }) => (
              <details key={s.id} className="pay-detail">
                <summary>
                  <span className="dot" style={{ background: s.display_color, marginRight: 6 }} />
                  {displayName(s)}
                  {/* 途中経過の金額を出すと振込額と誤認するため、総支給と振込額（差引支給）を明示する */}
                  <span className="soft" style={{ marginLeft: 8, fontSize: 12 }}>
                    実働 {hhmm(pay.workedMin)} ・ 総支給 {yen(grossTotal)} ・ <strong>振込 {yen(ded.net)}</strong>
                  </span>
                </summary>
                <table className="staff-table" style={{ fontSize: 12.5, marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>日付</th>
                      <th>出退勤</th>
                      <th style={{ textAlign: "right" }}>実働</th>
                      <th style={{ textAlign: "right" }}>休憩</th>
                      <th style={{ textAlign: "right" }}>残業</th>
                      <th style={{ textAlign: "right" }}>深夜</th>
                      <th style={{ textAlign: "right" }}>時給</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pay.days.map((d) => (
                      <tr key={d.date}>
                        <td className="en" style={{ whiteSpace: "nowrap" }}>{d.date.slice(5).replace("-", "/")}</td>
                        <td className="en" style={{ whiteSpace: "nowrap" }}>
                          {d.inOut.map((io, i) => (
                            <span key={i}>
                              {i > 0 && ", "}
                              {io.in}–{io.out}
                            </span>
                          ))}
                        </td>
                        <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{hhmm(d.workedMin)}</td>
                        <td className="en" style={{ textAlign: "right" }}>{d.breakMin}分</td>
                        <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{hhmm(d.overtimeMin)}</td>
                        <td className="en" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{hhmm(d.nightMin)}</td>
                        <td className="en" style={{ textAlign: "right" }}>{d.wage ? yen(d.wage) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
