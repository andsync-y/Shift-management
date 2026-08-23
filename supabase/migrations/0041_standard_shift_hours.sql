-- 1日の所定勤務時間（拘束・時間）。正社員のように「1日◯時間勤務」が
-- 決まっている人に設定する。例：8.5 → 8.5時間勤務・休憩60分・実働7.5時間。
--
-- シフト生成（ソルバー・固定シフト展開）はこの長さを上限として割り当てる。
-- null のときは従来どおり、必要人数の枠／固定シフトの長さをそのまま使う。
alter table public.profiles
  add column if not exists standard_shift_hours numeric(4, 2)
    check (standard_shift_hours is null or (standard_shift_hours > 0 and standard_shift_hours <= 24));

comment on column public.profiles.standard_shift_hours is
  '1日の所定勤務時間（拘束・時間）。実働は休憩自動控除後（8h超→-60分／6h超→-45分）。';
