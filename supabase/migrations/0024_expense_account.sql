-- =====================================================================
-- 経理⑥ 勘定科目（経費の科目別集計・確定申告用）
-- =====================================================================
-- カード明細に勘定科目(account)を持たせ、科目×月で集計するビューを追加。
-- 未設定は '未分類' として集計。
-- =====================================================================

alter table card_transactions add column if not exists account text;

create or replace view v_expense_by_account_monthly as
select
  to_char(transaction_date, 'YYYY-MM') as month,
  coalesce(nullif(trim(account), ''), '未分類') as account,
  sum(amount) as total
from card_transactions
group by 1, 2;

revoke all on v_expense_by_account_monthly from anon, authenticated;
grant select on v_expense_by_account_monthly to service_role;
