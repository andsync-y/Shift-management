-- =====================================================================
-- 指名料バック：1指名あたりの単価（profiles）＋ 月ごとの指名本数（手入力）
-- =====================================================================
-- 最終給与（総支給）に「指名バック = 単価 × 指名本数」を加算する。
-- 指名本数は給与画面で月ごとに手入力する。
-- =====================================================================

-- スタッフごとの指名バック単価（円/指名）
alter table public.profiles
  add column if not exists nomination_back_rate integer not null default 0;

-- 月ごとの指名本数（手入力）
create table if not exists nomination_counts (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references profiles(id) on delete cascade,
  month      text not null check (month ~ '^\d{4}-\d{2}$'), -- "YYYY-MM"
  count      integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, month)
);

create trigger trg_nomination_counts_updated before update on nomination_counts
  for each row execute function set_updated_at();
create trigger trg_audit_nomination_counts after insert or update or delete on nomination_counts
  for each row execute function audit_trigger();

alter table nomination_counts enable row level security;
create policy "指名本数はオーナーのみ" on nomination_counts for all using (is_super_admin()) with check (is_super_admin());
