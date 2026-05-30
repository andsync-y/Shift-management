-- =====================================================================
-- 休み希望に「種別」を追加（欠勤 / 時間変更）
-- =====================================================================
-- request_type:
--   'off'         … 欠勤（終日 or 時間帯休み）。従来の挙動。
--                   start_time/end_time が入っていればその時間帯を休む。
--   'time_change' … 勤務時間の変更希望。start_time/end_time に
--                   「希望する新しい勤務時間」を入れる。
-- =====================================================================

alter table time_off_requests
  add column if not exists request_type text not null default 'off'
    check (request_type in ('off', 'time_change'));
