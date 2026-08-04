-- =====================================================================
-- 店休・店舗お知らせ（日単位イベント）
-- =====================================================================
-- 特定の日を「店休（closed）」または「お知らせ（note）」として、シフト
-- カレンダーの該当日にバナー表示する。
-- 例: 8/18 店休 / アドバンス講習 10:00-17:00 / ※基本的に全員参加。
--   - kind        … closed=店休 / note=お知らせ（営業はする）
--   - title       … 見出し（例: アドバンス講習）
--   - body        … 補足メモ（任意・複数行可）
--   - start_time / end_time … 時間帯（任意。両方あれば「10:00–17:00」表示）
--   - all_hands   … ※基本的に全員参加
-- 閲覧は全ログインユーザー（スタッフ含む）、編集はオーナーのみ。
-- kiosk はサービスロールで取得するため RLS を回避して表示できる。
-- =====================================================================

create table if not exists store_events (
  id          uuid primary key default gen_random_uuid(),
  event_date  date not null,
  kind        text not null default 'closed',   -- 'closed'（店休）/ 'note'（お知らせ）
  title       text not null,
  body        text,
  start_time  time,
  end_time    time,
  all_hands   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists store_events_date on store_events (event_date);

alter table store_events enable row level security;

create policy "店休・お知らせは全員閲覧可"
  on store_events for select using (auth.uid() is not null);

create policy "店休・お知らせの編集は管理者のみ"
  on store_events for all
  using (is_super_admin()) with check (is_super_admin());
