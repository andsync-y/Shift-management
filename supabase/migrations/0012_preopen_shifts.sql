-- =====================================================================
-- プレオープン出勤シフト（オーナーが画面から編集する）
-- =====================================================================
-- これまで src/lib/preopen.ts にハードコードしていたプレオープン専用シフトを
-- DB管理に移し、オーナーが /admin/preopen から編集できるようにする。
-- 受付数（各枠の受付可能人数）はこのテーブルから算出する。
-- is_training=true は「研修のみ（施術に入らない）」で、受付数には数えない。
-- =====================================================================

create table if not exists preopen_shifts (
  id           uuid primary key default gen_random_uuid(),
  reserve_date date not null,
  staff_id     uuid not null references profiles(id) on delete cascade,
  start_time   time not null,
  end_time     time not null,
  is_training  boolean not null default false,
  created_at   timestamptz not null default now(),
  check (start_time < end_time),
  unique (reserve_date, staff_id)
);

create index if not exists preopen_shifts_date on preopen_shifts (reserve_date);

alter table preopen_shifts enable row level security;

-- 閲覧: ログイン中のユーザー全員（シフト表・空き状況の表示に使う）
create policy "プレオープン勤務の閲覧(ログイン者)"
  on preopen_shifts for select
  using (auth.uid() is not null);

-- 編集: オーナーのみ
create policy "プレオープン勤務の編集(管理者)"
  on preopen_shifts for all
  using (is_super_admin())
  with check (is_super_admin());
