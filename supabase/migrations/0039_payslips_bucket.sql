-- 給与明細PDFの保存先 Storage バケット（非公開）。
-- 「明細PDFをLINE送信」で生成したPDFを保存し、署名付きURLをスタッフへ送る。
-- 保存・取得はどちらも service role（createAdminClient）経由なので RLS ポリシーは不要。
insert into storage.buckets (id, name, public)
values ('payslips', 'payslips', false)
on conflict (id) do nothing;
