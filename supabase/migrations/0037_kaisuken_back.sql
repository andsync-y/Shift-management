-- =====================================================================
-- 回数券バック：月ごとの回数券販売本数（手入力）＋ 本数連動の段階バック
-- =====================================================================
-- 最終給与（総支給）に「回数券バック」を加算する。
--   バック = 本数連動の単価 × 本数
--   単価（本数で決まる）: 1〜3本 ¥1,000 / 4〜7本 ¥2,000 / 8本〜 ¥3,000
--   本数 = 当月の回数券販売本数（新規＋更新の合計）。給与画面で月ごとに手入力する。
-- 指名バック（nomination_counts）と同じ運用・同じ権限モデル。
-- =====================================================================

-- 月ごとの回数券販売本数（手入力）
create table if not exists kaisuken_counts (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references profiles(id) on delete cascade,
  month      text not null check (month ~ '^\d{4}-\d{2}$'), -- "YYYY-MM"
  count      integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, month)
);

create trigger trg_kaisuken_counts_updated before update on kaisuken_counts
  for each row execute function set_updated_at();
create trigger trg_audit_kaisuken_counts after insert or update or delete on kaisuken_counts
  for each row execute function audit_trigger();

alter table kaisuken_counts enable row level security;
create policy "回数券本数はオーナーのみ" on kaisuken_counts for all using (is_super_admin()) with check (is_super_admin());
