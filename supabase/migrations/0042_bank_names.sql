-- 振込先の金融機関名・支店名（半角カナ）。
-- 三井住友(Web21)はコードから名称を自動補完したため空欄で通っていたが、
-- しょうしん（岐阜商工信用組合）の総合振込は名称が空だとエラーになる
--   「振込先金融機関名の指定がありません。[BZBE311164]」
--   「振込先支店名の指定がありません。[BZBE311170]」
-- 全銀フォーマットの明細レコード 6〜20桁目(金融機関名15) / 24〜38桁目(支店名15)。
-- 全角カナで入れてもアプリ側で半角へ自動変換する。
alter table public.profiles
  add column if not exists bank_name text,
  add column if not exists branch_name text;

comment on column public.profiles.bank_name is '振込先 金融機関名（カナ・15文字以内推奨）。空でも可だが銀行によっては必須';
comment on column public.profiles.branch_name is '振込先 支店名（カナ・15文字以内推奨）';
