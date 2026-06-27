-- 店舗書類（カウンセリングシート・回数券規約）をアプリに保持し、受付タブレットから印刷する。
-- ファイルは固定パス（counseling / ticket-terms）に upsert で差し替える＝URLは不変。
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
