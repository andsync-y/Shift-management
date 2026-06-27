-- =====================================================================
-- 遅番（13:00–22:00）を 12:30–22:00 開始へ一括変更
-- =====================================================================
-- 遅番の開始 13:00 → 12:30 に統一する。終了(22:00)は変更しない。
-- 対象: 固定シフト / 必要人数(要件) / 希望シフト窓 / 生成済み(確定)シフト。
-- ※ end_time = '22:00' で限定し、13:00開始でも終了が異なる枠（早上がり等）は対象外。
-- ※ 実打刻(time_records)は実績なので変更しない。
--   プレオープン(preopen_shifts)は別イベントのため対象外。
-- =====================================================================

update fixed_shifts             set start_time = '12:30' where start_time = '13:00' and end_time = '22:00';
update shift_requirements       set start_time = '12:30' where start_time = '13:00' and end_time = '22:00';
update availability_preferences set start_time = '12:30' where start_time = '13:00' and end_time = '22:00';
update shifts                   set start_time = '12:30' where start_time = '13:00' and end_time = '22:00';
