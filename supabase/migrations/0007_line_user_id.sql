-- =====================================================================
-- LINE 連携：profiles に LINE ユーザーIDを追加
-- =====================================================================
-- line_user_id … LINE の OIDC `sub`（U で始まる固定ID）。
--   LINEログイン時の本人照合、LINE通知の push 先として使う。
--   未連携のスタッフは NULL。
-- =====================================================================

alter table profiles
  add column if not exists line_user_id text;

-- 1つの LINE アカウントが複数スタッフに紐づくのを防ぐ
create unique index if not exists profiles_line_user_id_key
  on profiles (line_user_id)
  where line_user_id is not null;
