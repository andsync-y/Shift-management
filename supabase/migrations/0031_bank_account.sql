-- 給与の総合振込（全銀フォーマット）用に、各スタッフの振込先口座を保持する。
alter table public.profiles
  add column if not exists bank_code text,        -- 銀行コード(4桁)
  add column if not exists branch_code text,      -- 支店コード(3桁)
  add column if not exists account_type text default '1', -- 預金種目 1=普通 2=当座
  add column if not exists account_number text,   -- 口座番号(最大7桁)
  add column if not exists recipient_kana text;   -- 受取人名（カナ）
