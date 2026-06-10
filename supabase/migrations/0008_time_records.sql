-- =====================================================================
-- 勤怠（タイムカード）: LINEからの打刻を記録する
-- =====================================================================
-- LINE公式アカウントに「おはようございます」で出勤、「お疲れ様です」で退勤。
-- 1レコード = 1出勤〜退勤。退勤前（clock_out が NULL）が「打刻中」。
-- =====================================================================

create table if not exists time_records (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references profiles(id) on delete cascade,
  work_date   date not null,               -- 出勤日（JST基準）
  clock_in    timestamptz,
  clock_out   timestamptz,
  source      text not null default 'line',-- line / manual
  in_lat      double precision,            -- 打刻時の位置（任意）
  in_lng      double precision,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists time_records_staff_date on time_records (staff_id, work_date);
-- 「打刻中（退勤前）」を素早く引くため
create index if not exists time_records_open on time_records (staff_id) where clock_out is null;

alter table time_records enable row level security;

create policy "勤怠の閲覧(本人/管理者)"
  on time_records for select
  using (staff_id = auth.uid() or is_super_admin());

-- 手動の追加・修正は管理者のみ（LINE Webhook は service role で RLS をバイパス）
create policy "勤怠の編集は管理者"
  on time_records for all
  using (is_super_admin()) with check (is_super_admin());
