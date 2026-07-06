-- =====================================================================
-- 給与控除（雇用保険・社会保険・源泉所得税）→ 差引支給額（手取り）
-- =====================================================================
-- profiles に税・保険の設定を追加し、源泉所得税の月次手入力（上書き）
-- テーブルを新設する。計算本体は src/lib/deductions.ts。
-- =====================================================================

-- 税区分（甲/乙）: 扶養控除等申告書を当店に提出済み = 'kou'（甲欄）。
-- 未提出（他社が本業のダブルワーク等）= 'otsu'（乙欄・既定）。
alter table public.profiles
  add column if not exists tax_column text not null default 'otsu'
    check (tax_column in ('kou', 'otsu'));

-- 扶養親族等の数（甲欄の源泉計算に使用）
alter table public.profiles
  add column if not exists dependents_count integer not null default 0
    check (dependents_count >= 0);

-- 雇用保険 加入（週20時間以上・31日以上見込みで加入）
alter table public.profiles
  add column if not exists emp_insurance_enrolled boolean not null default true;

-- 社会保険（健康保険・厚生年金）加入
alter table public.profiles
  add column if not exists shaho_enrolled boolean not null default false;

-- 介護保険 第2号被保険者（40〜64歳。健保料率に上乗せ）
alter table public.profiles
  add column if not exists kaigo_applicable boolean not null default false;

-- 月ごとの源泉所得税の手入力（自動計算できない区分の上書き。入力があれば常に優先）
create table if not exists income_tax_overrides (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references profiles(id) on delete cascade,
  month      text not null check (month ~ '^\d{4}-\d{2}$'), -- "YYYY-MM"
  amount     integer not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, month)
);

create trigger trg_income_tax_overrides_updated before update on income_tax_overrides
  for each row execute function set_updated_at();
create trigger trg_audit_income_tax_overrides after insert or update or delete on income_tax_overrides
  for each row execute function audit_trigger();

alter table income_tax_overrides enable row level security;
create policy "源泉上書きはオーナーのみ" on income_tax_overrides for all using (is_super_admin()) with check (is_super_admin());
