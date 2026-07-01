-- 領収書画像の保存先 Storage バケット（非公開）。
-- 0020_accounting.sql で receipts テーブルは作ったが、画像を置くバケットが未作成で
-- アップロードが「receipts バケットが必要」で失敗していたため補完する。
-- 保存・取得はどちらも service role（createAdminClient）経由なので RLS ポリシーは不要。
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;
