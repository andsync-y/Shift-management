-- FC本部システムへの転記に必要な項目を profiles に追加する。
-- 本部「スタッフ管理」フォームが要求する「カナ氏名」「在籍状況」を保持する。
--   name_kana   : カナ氏名（本部フォーム必須）
--   work_status : 在籍状況（active=在籍中 / on_leave=休職中 / retired=退職）
-- 既存行は is_active から初期化する（true→active, false→retired）。

alter table public.profiles
  add column if not exists name_kana text,
  add column if not exists work_status text not null default 'active';

-- 在籍状況は3値のいずれか
alter table public.profiles
  drop constraint if exists profiles_work_status_check;
alter table public.profiles
  add constraint profiles_work_status_check
  check (work_status in ('active', 'on_leave', 'retired'));

-- 既存データの初期化（is_active を尊重）
update public.profiles
  set work_status = case when is_active then 'active' else 'retired' end
  where work_status is null or work_status = 'active';
