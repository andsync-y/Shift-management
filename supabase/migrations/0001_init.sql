-- =====================================================================
-- 全力ストレッチ岐阜長良店 シフト管理サービス  初期スキーマ
-- =====================================================================
-- 認証は Supabase Auth (auth.users) を利用する。
-- profiles.id は auth.users.id を参照する 1:1 拡張テーブル。
-- =====================================================================

-- --- 列挙型 -----------------------------------------------------------
create type user_role as enum ('super_admin', 'staff');
create type employment_type as enum ('full_time', 'part_time');
create type availability_pref as enum ('preferred', 'available', 'unavailable');
create type period_status as enum ('draft', 'published', 'confirmed');
create type request_status as enum ('pending', 'approved', 'rejected');

-- --- プロフィール -----------------------------------------------------
create table profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text not null,
  role            user_role not null default 'staff',
  employment_type employment_type not null default 'part_time',
  phone           text,
  hourly_wage     integer,
  -- 1週間あたりの希望労働時間（時間単位）
  min_hours_per_week integer not null default 0,
  max_hours_per_week integer not null default 40,
  -- シフト表での表示色
  display_color   text not null default '#e8380d',
  -- 対応可能スキル（例: 初回カウンセリング, 担当上限人数 など自由記述タグ）
  skills          text[] not null default '{}',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- --- 週次の希望シフト（曜日ごとの就業可否） ---------------------------
create table availability_preferences (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references profiles (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=日, 6=土
  start_time  time not null,
  end_time    time not null,
  preference  availability_pref not null default 'available',
  created_at  timestamptz not null default now(),
  check (start_time < end_time)
);
create index on availability_preferences (staff_id);

-- --- 月次シフト期間 ---------------------------------------------------
create table shift_periods (
  id          uuid primary key default gen_random_uuid(),
  year        smallint not null,
  month       smallint not null check (month between 1 and 12),
  status      period_status not null default 'draft',
  note        text,
  created_at  timestamptz not null default now(),
  published_at timestamptz,
  confirmed_at timestamptz,
  unique (year, month)
);

-- --- 必要人数の定義（曜日ごと / 時間帯ごと） --------------------------
create table shift_requirements (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references shift_periods (id) on delete cascade,
  day_of_week   smallint not null check (day_of_week between 0 and 6),
  start_time    time not null,
  end_time      time not null,
  required_staff smallint not null default 1 check (required_staff >= 0),
  created_at    timestamptz not null default now(),
  check (start_time < end_time)
);
create index on shift_requirements (period_id);

-- --- 確定/ドラフトのシフト割当 ----------------------------------------
create table shifts (
  id          uuid primary key default gen_random_uuid(),
  period_id   uuid not null references shift_periods (id) on delete cascade,
  staff_id    uuid not null references profiles (id) on delete cascade,
  work_date   date not null,
  start_time  time not null,
  end_time    time not null,
  -- ソルバーが付与した充足スコアや備考
  note        text,
  -- LLM が生成 / 調整した割当かどうか
  ai_generated boolean not null default false,
  created_at  timestamptz not null default now(),
  check (start_time < end_time)
);
create index on shifts (period_id);
create index on shifts (staff_id);
create index on shifts (work_date);

-- --- お休み希望申請 ---------------------------------------------------
create table time_off_requests (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references profiles (id) on delete cascade,
  period_id   uuid references shift_periods (id) on delete set null,
  off_date    date not null,
  -- NULL の場合は終日休み
  start_time  time,
  end_time    time,
  reason      text,
  status      request_status not null default 'pending',
  reviewed_by uuid references profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index on time_off_requests (staff_id);
create index on time_off_requests (period_id);

-- --- 店舗設定（営業時間など） ----------------------------------------
create table store_settings (
  id          smallint primary key default 1 check (id = 1),
  store_name  text not null default '全力ストレッチ岐阜長良店',
  open_time   time not null default '10:00',
  close_time  time not null default '21:00',
  -- 1コマの長さ（分）
  slot_minutes smallint not null default 60,
  updated_at  timestamptz not null default now()
);
insert into store_settings (id) values (1) on conflict do nothing;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table profiles                enable row level security;
alter table availability_preferences enable row level security;
alter table shift_periods           enable row level security;
alter table shift_requirements       enable row level security;
alter table shifts                  enable row level security;
alter table time_off_requests        enable row level security;
alter table store_settings           enable row level security;

-- 現在のユーザーが super_admin かどうか判定するヘルパー
create or replace function is_super_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

-- --- profiles --------------------------------------------------------
create policy "本人は自分のプロフィールを閲覧"
  on profiles for select using (id = auth.uid() or is_super_admin());
create policy "本人は自分のプロフィールを更新"
  on profiles for update using (id = auth.uid() or is_super_admin());
create policy "管理者はプロフィールを作成"
  on profiles for insert with check (is_super_admin() or id = auth.uid());
create policy "管理者はプロフィールを削除"
  on profiles for delete using (is_super_admin());

-- --- availability_preferences ----------------------------------------
create policy "希望シフトの閲覧"
  on availability_preferences for select
  using (staff_id = auth.uid() or is_super_admin());
create policy "希望シフトの編集(本人/管理者)"
  on availability_preferences for all
  using (staff_id = auth.uid() or is_super_admin())
  with check (staff_id = auth.uid() or is_super_admin());

-- --- shift_periods ---------------------------------------------------
create policy "公開済み期間はスタッフも閲覧"
  on shift_periods for select
  using (is_super_admin() or status in ('published', 'confirmed'));
create policy "期間の編集は管理者のみ"
  on shift_periods for all
  using (is_super_admin()) with check (is_super_admin());

-- --- shift_requirements ----------------------------------------------
create policy "必要人数は管理者のみ"
  on shift_requirements for all
  using (is_super_admin()) with check (is_super_admin());

-- --- shifts ----------------------------------------------------------
create policy "シフト閲覧: 管理者は全件 / スタッフは公開期間"
  on shifts for select
  using (
    is_super_admin()
    or exists (
      select 1 from shift_periods p
      where p.id = shifts.period_id
        and p.status in ('published', 'confirmed')
    )
  );
create policy "シフト編集は管理者のみ"
  on shifts for all
  using (is_super_admin()) with check (is_super_admin());

-- --- time_off_requests -----------------------------------------------
create policy "休み希望の閲覧(本人/管理者)"
  on time_off_requests for select
  using (staff_id = auth.uid() or is_super_admin());
create policy "休み希望の作成は本人"
  on time_off_requests for insert
  with check (staff_id = auth.uid());
create policy "休み希望の更新(本人は申請内容/管理者は承認)"
  on time_off_requests for update
  using (staff_id = auth.uid() or is_super_admin())
  with check (staff_id = auth.uid() or is_super_admin());
create policy "休み希望の削除(本人/管理者)"
  on time_off_requests for delete
  using (staff_id = auth.uid() or is_super_admin());

-- --- store_settings --------------------------------------------------
create policy "店舗設定は全員閲覧可"
  on store_settings for select using (auth.uid() is not null);
create policy "店舗設定の編集は管理者のみ"
  on store_settings for update
  using (is_super_admin()) with check (is_super_admin());

-- =====================================================================
-- 新規 auth ユーザー作成時に profiles 行を自動生成するトリガー
-- =====================================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
