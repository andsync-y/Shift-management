-- =====================================================================
-- 欠勤記録：シフトが入っていた日に休んだ／遅刻した記録を残す
-- =====================================================================
-- 「休み希望（time_off_requests）」は事前の“申請”で、承認されればシフトに
-- 入らない。こちらは入っていたシフトに対する“事実”の記録なので別テーブルにする。
--
-- 運用：スタッフからLINEでオーナーに連絡が来る → オーナーが管理画面で登録する。
--       無断欠勤（連絡なし）は kind='no_show'・reported_at を空にする。
--
-- 給与には手を入れない。賃金は実打刻ベースなので、休んだ分は自動的に出ない。
-- この記録は労務管理（出勤率の把握・指導の記録）と、社保の所定労働時間を
-- 恒常的に下回っていないかの確認に使う。
-- =====================================================================

create table if not exists absences (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references profiles (id) on delete cascade,
  absence_date date not null,
  -- absent=欠勤(連絡あり) / no_show=無断欠勤 / late=遅刻 / early_leave=早退
  kind         text not null default 'absent'
               check (kind in ('absent', 'no_show', 'late', 'early_leave')),
  reason       text,                    -- 本人の申し出（体調不良・家庭の事情 など）
  note         text,                    -- オーナーの補足
  reported_at  timestamptz,             -- 連絡を受けた日時。無断欠勤なら NULL
  created_by   uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- 同じ日に「遅刻」と「早退」が両方起きることはあるので kind まで含めて一意にする
  unique (staff_id, absence_date, kind)
);
create index if not exists absences_staff on absences (staff_id);
create index if not exists absences_date on absences (absence_date);

create trigger trg_absences_updated before update on absences
  for each row execute function set_updated_at();
create trigger trg_audit_absences after insert or update or delete on absences
  for each row execute function audit_trigger();

alter table absences enable row level security;
create policy "欠勤記録はオーナーが全操作" on absences
  for all using (is_super_admin()) with check (is_super_admin());
-- 本人は自分の記録だけ見られる（身に覚えのない記録が残らないように）
create policy "本人は自分の欠勤を閲覧" on absences
  for select using (staff_id = auth.uid());
