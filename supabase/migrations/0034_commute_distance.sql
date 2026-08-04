-- 交通費を「距離ベース」で計算するための片道距離。
-- 交通費 = 片道距離(km) × 2(往復) × 単価(15円/km) × 当月の勤務日数(実打刻日数)。
-- commute_distance_km が入っていればこちらを優先、空なら従来の commute_allowance(月額固定) を使う。
alter table public.profiles
  add column if not exists commute_distance_km numeric(5,1); -- 片道距離(km)
