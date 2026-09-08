-- =====================================================================
-- マルチテナント化 Step A：store_id の追加（後方互換・RLSは変更しない）
-- =====================================================================
-- 目的:
--   2号店の出店と、システムの他店舗提供に備えて「どの店舗の行か」を持たせる。
--   現状は全30テーブルに店舗を区別する列が無く、単一店舗前提になっている。
--
-- この移行の安全性（本番で打刻・給与が毎日動いているため最重要）:
--   1. 追加する store_id は NOT NULL だが DEFAULT に現店舗のIDを入れてある。
--      → 既存のアプリコードは store_id を渡さないが、DEFAULT が入るので壊れない。
--   2. RLSポリシーは一切変更しない。
--      → 既存の権限判定（auth.uid() / is_super_admin()）はそのまま動く。
--      → 店舗が1つしか無い間は、絞り込みが無くても結果は同じ。
--   3. ビューは全て列を明示列挙しているため、列追加の影響を受けない（確認済み）。
--
-- 後続の段階（別PRで行う。この移行だけでは完結しない）:
--   Step B: アプリ側で store_id を明示的にセットし、クエリに店舗の絞り込みを入れる。
--   Step C: RLSポリシーに店舗条件を足し、DEFAULT を外す。
--           ここまで終えて初めて、2店舗目のデータを安全に同居させられる。
-- =====================================================================

-- --- 1. stores -------------------------------------------------------
create table if not exists stores (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table stores is '店舗マスタ。マルチテナントのテナント単位。';
comment on column stores.code is 'URLやAPIで使う短い識別子（例: gifu-nagara）。';

-- 既存の唯一の店舗。IDは固定値にして、DEFAULT から参照できるようにする。
insert into stores (id, code, name)
values ('00000000-0000-4000-8000-000000000001', 'gifu-nagara', '全力ストレッチ岐阜長良店')
on conflict (id) do nothing;

-- --- 2. 業務テーブルへ store_id を追加 --------------------------------
-- バックアップ表（shifts_backup_*）とビュー（v_*）は対象外。
do $$
declare
  t text;
  target_tables text[] := array[
    'audit_logs', 'availability_preferences', 'card_transactions', 'clock_reminders',
    'ec_orders', 'fc_kpi', 'fixed_costs', 'fixed_shifts', 'income_tax_overrides',
    'kaisuken_counts', 'nomination_counts', 'payroll_adjustments', 'preopen_reservations',
    'preopen_shifts', 'profiles', 'receipts', 'shift_periods', 'shift_requirements',
    'shifts', 'store_events', 'store_settings', 'time_off_requests', 'time_records'
  ];
begin
  foreach t in array target_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'skip: table % not found', t;
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists store_id uuid not null '
      || 'default %L references public.stores(id)',
      t, '00000000-0000-4000-8000-000000000001'
    );

    execute format(
      'create index if not exists %I on public.%I (store_id)',
      t || '_store_id_idx', t
    );
  end loop;
end $$;

-- --- 3. 現在のユーザーが所属する店舗を返すヘルパー --------------------
-- Step C の RLS で使う。この移行時点ではまだどのポリシーからも参照していない。
create or replace function current_store_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select store_id from public.profiles where id = auth.uid()
$$;

comment on function current_store_id() is
  'ログイン中ユーザーの所属店舗ID。Step CのRLSポリシーで使用する。';

-- --- 4. store_settings は店舗につき1行 --------------------------------
create unique index if not exists store_settings_store_uniq
  on public.store_settings (store_id);

-- --- 5. stores のRLS --------------------------------------------------
alter table stores enable row level security;

drop policy if exists "店舗の閲覧(ログイン者)" on stores;
create policy "店舗の閲覧(ログイン者)"
  on stores for select
  using (auth.uid() is not null);

drop policy if exists "店舗の編集(super_admin)" on stores;
create policy "店舗の編集(super_admin)"
  on stores for all
  using (is_super_admin())
  with check (is_super_admin());
