-- =====================================================================
-- 経理⑤ 月次売上（手入力）＋ 月次P&Lへ反映
-- =====================================================================
-- まずは月ごとに売上合計を手入力できるテーブル。将来POS/予約実績と連携可能。
-- =====================================================================

create table if not exists monthly_sales (
  id         uuid primary key default gen_random_uuid(),
  month      text not null unique check (month ~ '^\d{4}-\d{2}$'), -- "YYYY-MM"
  amount     numeric(12, 0) not null default 0,
  memo       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_monthly_sales_updated before update on monthly_sales
  for each row execute function set_updated_at();
create trigger trg_audit_monthly_sales after insert or update or delete on monthly_sales
  for each row execute function audit_trigger();

alter table monthly_sales enable row level security;
create policy "売上はオーナーのみ" on monthly_sales for all using (is_super_admin()) with check (is_super_admin());

-- 月次P&L を売上テーブル連携に差し替え（0022 の仮0版を上書き）
create or replace view v_pl_monthly as
with months as (
  select month from v_labor_cost_monthly
  union select month from v_expense_monthly
  union select month from monthly_sales
)
select
  m.month,
  coalesce(s.amount, 0) as sales,
  coalesce(e.expense, 0) as expense,
  coalesce(l.labor_cost, 0) as labor_cost,
  coalesce(s.amount, 0) - coalesce(e.expense, 0) - coalesce(l.labor_cost, 0) as operating_profit
from months m
left join monthly_sales s on s.month = m.month
left join v_expense_monthly e on e.month = m.month
left join v_labor_cost_monthly l on l.month = m.month
order by m.month;

revoke all on v_pl_monthly from anon, authenticated;
grant select on v_pl_monthly to service_role;
