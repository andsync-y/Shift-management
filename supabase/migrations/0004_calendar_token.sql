-- =====================================================================
-- カレンダー購読トークン（ICSフィード用）
-- =====================================================================
-- 各スタッフが自分の確定シフトを Google/Apple/Outlook カレンダーで
-- 購読できるよう、推測困難なトークンを発行する。
-- フィード自体は未ログインのカレンダーアプリから取得されるため、
-- API側で service role を用い、このトークンで本人のシフトのみ返す。
-- =====================================================================

alter table profiles
  add column if not exists calendar_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_calendar_token_idx
  on profiles (calendar_token);
