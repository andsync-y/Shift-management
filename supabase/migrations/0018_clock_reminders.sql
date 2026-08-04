-- =====================================================================
-- 打刻リマインドの送信記録（重複送信の防止）
-- =====================================================================
-- 出勤/退勤の打刻リマインドを、同じシフト・同じ種別で二重に送らないための記録。
-- kind = 'in'（出勤打刻のお願い）/ 'out'（退勤打刻のお願い）。
-- Cron（/api/cron/clock-reminder）が service role で読み書きする。
-- =====================================================================

create table if not exists clock_reminders (
  id          uuid primary key default gen_random_uuid(),
  shift_id    uuid not null references shifts(id) on delete cascade,
  kind        text not null check (kind in ('in', 'out')),
  sent_at     timestamptz not null default now(),
  unique (shift_id, kind)
);

alter table clock_reminders enable row level security;
-- 参照/書き込みは service role（RLSバイパス）のみ想定。一般ロールには許可を付けない。
