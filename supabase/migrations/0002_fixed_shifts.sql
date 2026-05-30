-- =====================================================================
-- 固定シフト（曜日×時間の週次固定パターン）
-- =====================================================================
-- 固定シフト制の運用向け。各スタッフの「毎週この曜日はこの時間」を登録し、
-- 月次シフトへ一括展開する（希望休は除外）。
-- =====================================================================

create table fixed_shifts (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references profiles (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=日,6=土
  start_time  time not null,
  end_time    time not null,
  -- シフト種別の目安（early/late/short_5h など。任意）
  shift_type  text,
  created_at  timestamptz not null default now(),
  check (start_time < end_time),
  -- 同一スタッフ・同一曜日・同一開始時刻の重複を防ぐ
  unique (staff_id, day_of_week, start_time)
);
create index on fixed_shifts (staff_id);

alter table fixed_shifts enable row level security;

create policy "固定シフトの閲覧(本人/管理者)"
  on fixed_shifts for select
  using (staff_id = auth.uid() or is_super_admin());

create policy "固定シフトの編集(本人/管理者)"
  on fixed_shifts for all
  using (staff_id = auth.uid() or is_super_admin())
  with check (staff_id = auth.uid() or is_super_admin());
