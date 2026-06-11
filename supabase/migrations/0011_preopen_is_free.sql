-- =====================================================================
-- プレオープン予約：担当区分（自分が施術 / フリー＝誰が施術してもよい）
-- =====================================================================

alter table preopen_reservations
  add column if not exists is_free boolean not null default false;
