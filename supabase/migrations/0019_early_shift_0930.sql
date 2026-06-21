-- =====================================================================
-- 早番（および10:00開始の枠）を 9:30 開始へ一括変更
-- =====================================================================
-- 開始10:00 → 09:30 に統一する。終了時刻は変更しない。
-- 対象: 固定シフト / 必要人数(要件) / 希望シフト窓 / 生成済み(確定)シフト。
-- ※ 実打刻(time_records)は実績なので変更しない。プレオープン(preopen_shifts)は13:00開始のため対象外。
-- =====================================================================

update fixed_shifts            set start_time = '09:30' where start_time = '10:00';
update shift_requirements      set start_time = '09:30' where start_time = '10:00';
update availability_preferences set start_time = '09:30' where start_time = '10:00';
update shifts                  set start_time = '09:30' where start_time = '10:00';
