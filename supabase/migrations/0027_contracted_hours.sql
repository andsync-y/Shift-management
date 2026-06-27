-- 社会保険の加入判定（所定労働時間ベース）に使う「週の所定労働時間」を追加する。
-- 契約上の固定週時間（例: 20.0, 37.5）。未設定(null)の場合は実績の週平均で代用判定する。
alter table public.profiles
  add column if not exists contracted_weekly_hours numeric(4,1);

comment on column public.profiles.contracted_weekly_hours is
  '週の所定労働時間（社保加入判定用）。契約上の固定週時間。';
