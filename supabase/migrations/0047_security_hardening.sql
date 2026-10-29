-- =====================================================================
-- セキュリティ強化（2026-10 点検の指摘対応）
-- =====================================================================
-- 点検で見つかった問題と対処:
--  1. 人件費・経費ビュー5本が SECURITY DEFINER で RLS を迂回し、anon（未ログイン）にも
--     SELECT が付いていた → 公開のanonキーだけで全スタッフの氏名・勤務時間・人件費が読めた。
--     → security_invoker にして RLS を効かせ、anon の権限を外す。
--  2. profiles を「ログイン済みなら全員の全列」読めた（口座番号・初期パスワード・LINE ID・
--     カレンダートークン）。→ 本人とオーナーだけに絞り、名前・色などの一覧は
--     staff_directory ビュー（安全な列のみ）から読む。
--  3. profiles の UPDATE が本人なら全列可で、スタッフが自分の role を super_admin に
--     書き換えられた（権限昇格）。→ トリガーで本人が変えられる列を絞る＋INSERT も role=staff に限定。
--  4. SECURITY DEFINER 関数を anon / authenticated が /rest/v1/rpc から実行できた。
--     → トリガー/イベントトリガー専用の関数は EXECUTE を剥奪。
--  5. set_updated_at の search_path が固定されていなかった。
--
-- 適用順の注意: このマイグレーションと「staff/page.tsx・preopen-data.ts を staff_directory
-- 参照に変えたコード」は同時にデプロイする（先にこちらだけ適用するとスタッフ画面の
-- シフト表で他人の名前が出なくなる）。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 人件費・経費ビュー: RLS を効かせ、anon から外す
-- ---------------------------------------------------------------------
alter view public.v_labor_cost_staff_daily set (security_invoker = true);
alter view public.v_labor_cost_daily       set (security_invoker = true);
alter view public.v_labor_cost_monthly     set (security_invoker = true);
alter view public.v_expense_monthly        set (security_invoker = true);
alter view public.v_pl_monthly             set (security_invoker = true);

revoke all on public.v_labor_cost_staff_daily from anon;
revoke all on public.v_labor_cost_daily       from anon;
revoke all on public.v_labor_cost_monthly     from anon;
revoke all on public.v_expense_monthly        from anon;
revoke all on public.v_pl_monthly             from anon;

-- ---------------------------------------------------------------------
-- 2. profiles の閲覧を本人＋オーナーに絞る
-- ---------------------------------------------------------------------
drop policy if exists "ログイン済みはプロフィールを閲覧" on public.profiles;
drop policy if exists "本人とオーナーはプロフィールを閲覧" on public.profiles;
create policy "本人とオーナーはプロフィールを閲覧" on public.profiles
  for select using (id = auth.uid() or public.is_super_admin());

-- スタッフ画面（シフト表の氏名・色）用の名簿。機微な列（口座・パスワード・LINE ID・時給等）は出さない。
-- 意図的に SECURITY DEFINER（既定）のまま：profiles の RLS を越えて同じ店舗の名簿だけ見せるため。
create or replace view public.staff_directory as
  select id, full_name, display_name, display_color, role, is_active, work_status, store_id
  from public.profiles
  where store_id = public.current_store_id() or public.is_super_admin();

revoke all on public.staff_directory from public, anon;
grant select on public.staff_directory to authenticated;

-- ---------------------------------------------------------------------
-- 3. profiles の更新・作成での権限昇格を塞ぐ
-- ---------------------------------------------------------------------
revoke all on public.profiles from anon;

drop policy if exists "本人は自分のプロフィールを更新" on public.profiles;
create policy "本人は自分のプロフィールを更新" on public.profiles
  for update
  using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());

drop policy if exists "管理者はプロフィールを作成" on public.profiles;
create policy "管理者はプロフィールを作成" on public.profiles
  for insert
  with check (public.is_super_admin() or (id = auth.uid() and role = 'staff'));

-- オーナー（と service role）以外は、表示色・電話・フリガナ以外を変更できない。
create or replace function public.profiles_guard_self_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- service role 等（auth.uid() が無い）とオーナーは制限しない
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;
  if (to_jsonb(new) - array['display_color','phone','name_kana','updated_at'])
     is distinct from
     (to_jsonb(old) - array['display_color','phone','name_kana','updated_at']) then
    raise exception 'このプロフィール項目は本人では変更できません'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_guard_self_update() from public, anon, authenticated;

drop trigger if exists profiles_guard_self_update on public.profiles;
create trigger profiles_guard_self_update
  before update on public.profiles
  for each row execute function public.profiles_guard_self_update();

-- ---------------------------------------------------------------------
-- 4. SECURITY DEFINER 関数の公開を止める（トリガー専用のものだけ）
--    is_super_admin / current_store_id は RLS ポリシーが呼ぶので残す。
-- ---------------------------------------------------------------------
revoke execute on function public.audit_trigger()          from public, anon, authenticated;
revoke execute on function public.handle_new_user()        from public, anon, authenticated;
revoke execute on function public.match_card_to_receipt()  from public, anon, authenticated;
revoke execute on function public.match_receipt_to_card()  from public, anon, authenticated;
revoke execute on function public.rls_auto_enable()        from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. search_path の固定／RLS を素通りする権限の剥奪
-- ---------------------------------------------------------------------
alter function public.set_updated_at() set search_path = '';

-- TRUNCATE は RLS を無視する。API からは使えないが、不要な権限は持たせない。
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
