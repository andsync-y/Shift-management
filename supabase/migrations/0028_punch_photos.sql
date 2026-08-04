-- タブレット（キオスク）打刻：出勤/退勤の瞬間に撮ったセルフィー写真を保存する。
-- 顔認証（照合）ではなく、本人確認・代理打刻抑止のための証拠写真。
alter table public.time_records
  add column if not exists in_photo_url text,   -- 出勤時のセルフィー（Storage パス）
  add column if not exists out_photo_url text;  -- 退勤時のセルフィー（Storage パス）

-- 写真の保存先バケット（非公開）。service role からのみ読み書き（管理画面は署名URLで表示）。
insert into storage.buckets (id, name, public)
values ('punch-photos', 'punch-photos', false)
on conflict (id) do nothing;
