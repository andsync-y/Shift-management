-- =====================================================================
-- プレオープン 簡易予約（モデル客）
-- =====================================================================
-- スタッフが各自、知り合いを「モデル客」として時間枠に登録する。
-- 1枠4名（=ベッド数）の上限はアプリ側で制御する（人数管理のみ・ベッド指定なし）。
-- =====================================================================

create table if not exists preopen_reservations (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references profiles(id) on delete cascade,
  reserve_date  date not null,
  start_time    time not null,
  end_time      time not null,
  customer_name text not null,
  note          text,
  created_at    timestamptz not null default now()
);

create index if not exists preopen_res_slot on preopen_reservations (reserve_date, start_time);

alter table preopen_reservations enable row level security;

-- 閲覧: ログイン中のユーザー全員（枠の空き状況を共有するため）
create policy "予約の閲覧(ログイン者)"
  on preopen_reservations for select
  using (auth.uid() is not null);

-- 追加: 自分ぶんのみ（オーナーは誰のでも）
create policy "予約の追加(本人/管理者)"
  on preopen_reservations for insert
  with check (staff_id = auth.uid() or is_super_admin());

-- 更新: 自分ぶん or オーナー
create policy "予約の更新(本人/管理者)"
  on preopen_reservations for update
  using (staff_id = auth.uid() or is_super_admin())
  with check (staff_id = auth.uid() or is_super_admin());

-- 削除: 自分ぶん or オーナー
create policy "予約の削除(本人/管理者)"
  on preopen_reservations for delete
  using (staff_id = auth.uid() or is_super_admin());
