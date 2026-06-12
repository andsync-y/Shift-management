-- =====================================================================
-- スタッフ個別予定（不可時間ブロック）
-- =====================================================================
-- タイムツリー等の外部予定を取り込み、その時間帯はシフトに割り当てない。
-- 二俣・川島の新体操教室（夏休みは不定期）対応。本人/管理者のみ閲覧、編集は管理者。
-- start_time / end_time が NULL の行は「終日不可」。
-- シフト生成では time_off と同じ「不可時間」として扱う（solver が時間帯重なりで除外）。
-- =====================================================================

create table if not exists staff_blackouts (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references profiles(id) on delete cascade,
  blackout_date date not null,
  start_time    time,
  end_time      time,
  title         text,
  source        text not null default 'timetree', -- timetree / manual
  created_at    timestamptz not null default now()
);

create index if not exists staff_blackouts_staff_date on staff_blackouts (staff_id, blackout_date);

alter table staff_blackouts enable row level security;

create policy "個別予定の閲覧(本人/管理者)"
  on staff_blackouts for select
  using (staff_id = auth.uid() or is_super_admin());

create policy "個別予定の編集(管理者)"
  on staff_blackouts for all
  using (is_super_admin())
  with check (is_super_admin());
