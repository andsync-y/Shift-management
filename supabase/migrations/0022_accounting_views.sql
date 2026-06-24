-- =====================================================================
-- 経理システム④ 人件費ビュー ＋ 月次P&L（売上・販管費との合算用）
-- =====================================================================
-- 仕様の staff(時給)=profiles.hourly_wage、勤務=実打刻 time_records を採用。
-- 「実績人件費」は実打刻（出勤〜退勤）ベース。
-- ※ 休憩控除・残業/深夜割増・期間別時給は含まない簡易集計。
--   正確な支給額は /admin/payroll（src/lib/payroll.ts）を参照。
-- =====================================================================

-- 日次・スタッフ別の実績人件費（参考） -------------------------------
create or replace view v_labor_cost_staff_daily as
select
  tr.work_date,
  tr.staff_id,
  p.full_name,
  round(sum(extract(epoch from (tr.clock_out - tr.clock_in)) / 3600.0)::numeric, 2) as hours,
  round(sum(extract(epoch from (tr.clock_out - tr.clock_in)) / 3600.0 * coalesce(p.hourly_wage, 0))::numeric, 0) as labor_cost
from time_records tr
join profiles p on p.id = tr.staff_id
where tr.clock_in is not null and tr.clock_out is not null
group by tr.work_date, tr.staff_id, p.full_name;

-- 日次・店舗合計の実績人件費 ----------------------------------------
create or replace view v_labor_cost_daily as
select
  work_date,
  round(sum(hours)::numeric, 2) as hours,
  sum(labor_cost) as labor_cost
from v_labor_cost_staff_daily
group by work_date;

-- 月次・店舗合計の実績人件費 ----------------------------------------
create or replace view v_labor_cost_monthly as
select
  to_char(work_date, 'YYYY-MM') as month,
  round(sum(hours)::numeric, 2) as hours,
  sum(labor_cost) as labor_cost
from v_labor_cost_daily
group by to_char(work_date, 'YYYY-MM');

-- 月次・経費（カード明細の合計＝販管費の元データ） ------------------
create or replace view v_expense_monthly as
select
  to_char(transaction_date, 'YYYY-MM') as month,
  sum(amount) as expense
from card_transactions
group by to_char(transaction_date, 'YYYY-MM');

-- 月次P&L（売上・販管費・人件費を月キーで合算）---------------------
-- 売上(sales)テーブルは本仕様に含まれないため 0 を仮置き。売上テーブル追加時に
-- coalesce(s.sales,0) を差し替える。粗利 = 売上 −（販管費 + 人件費）。
create or replace view v_pl_monthly as
with months as (
  select month from v_labor_cost_monthly
  union
  select month from v_expense_monthly
)
select
  m.month,
  0::numeric as sales,                                   -- TODO: 売上テーブル連携
  coalesce(e.expense, 0) as expense,                     -- 販管費（カード明細）
  coalesce(l.labor_cost, 0) as labor_cost,               -- 実績人件費
  0::numeric - coalesce(e.expense, 0) - coalesce(l.labor_cost, 0) as operating_profit
from months m
left join v_expense_monthly e on e.month = m.month
left join v_labor_cost_monthly l on l.month = m.month
order by m.month;

-- ビューは定義者(postgres)権限で実行され RLS を回避するため、参照は
-- アプリ側でオーナー権限のサーバー処理から行うこと（service role / requireAdmin）。
