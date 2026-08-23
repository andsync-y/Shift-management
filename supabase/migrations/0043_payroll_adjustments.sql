-- 月別の給与調整（支給/控除）。
-- 立替精算・臨時手当・貸付返済・制服代など、時給計算やバックでは表せない増減を入れる。
--   amount > 0 … 支給（総支給に加算）
--   amount < 0 … 控除（総支給から減算）
--   taxable = true  … 課税対象（手当など。所得税・社保の算定に含む）
--   taxable = false … 非課税（立替金の精算など。交通費と同じく課税対象から除く）
create table if not exists public.payroll_adjustments (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.profiles (id) on delete cascade,
  month      text not null check (month ~ '^\d{4}-\d{2}$'),
  amount     integer not null default 0,
  label      text,
  taxable    boolean not null default true,
  created_at timestamptz not null default now(),
  unique (staff_id, month)
);
create index if not exists payroll_adjustments_month_idx on public.payroll_adjustments (month);

alter table public.payroll_adjustments enable row level security;

-- オーナーのみ参照・編集。スタッフは自分の分だけ参照できる（明細に出るため）。
create policy "owner manages payroll adjustments" on public.payroll_adjustments
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );
create policy "staff reads own payroll adjustment" on public.payroll_adjustments
  for select using (staff_id = auth.uid());
