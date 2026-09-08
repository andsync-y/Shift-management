-- =====================================================================
-- マルチテナント化 Step B：store_id の DEFAULT を「ログイン中ユーザーの店舗」にする
-- =====================================================================
-- Step A では DEFAULT に現店舗のIDをリテラルで埋めた。1店舗の間はそれで正しいが、
-- 2店舗目が入った瞬間、店舗2のユーザーの INSERT も店舗1のIDが入ってしまう。
--
-- アプリ側の INSERT/UPSERT は46か所ある。そのすべてに store_id を書き足すより、
-- DEFAULT 自体を「ログイン中ユーザーの所属店舗」にするほうが、書き漏らしが起きない。
--
--   default coalesce(current_store_id(), '<既定店舗>')
--
-- ログインユーザーの操作 … current_store_id() がその人の店舗を返す（正しい）
-- サービスロールの処理   … auth.uid() が null なので既定店舗にフォールバックする
--
-- ⚠️ フォールバックが効くのは「1店舗しか無いうちは正しい」という前提の上でだけ。
--    サービスロール（createAdminClient）で走る処理は、2店舗目を入れる前に
--    store_id を明示的に渡すよう直す必要がある。対象は docs/MULTI_TENANT.md の
--    チェックリストにまとめてある。src/lib/store.ts の requireStoreId() を使う。
-- =====================================================================

do $$
declare
  t text;
  target_tables text[] := array[
    'audit_logs', 'availability_preferences', 'card_transactions', 'clock_reminders',
    'ec_orders', 'fc_kpi', 'fixed_costs', 'fixed_shifts', 'income_tax_overrides',
    'kaisuken_counts', 'nomination_counts', 'payroll_adjustments', 'preopen_reservations',
    'preopen_shifts', 'profiles', 'receipts', 'shift_periods', 'shift_requirements',
    'shifts', 'store_events', 'store_settings', 'time_off_requests', 'time_records'
  ];
begin
  foreach t in array target_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'skip: table % not found', t;
      continue;
    end if;

    execute format(
      'alter table public.%I alter column store_id set default '
      || 'coalesce(public.current_store_id(), %L::uuid)',
      t, '00000000-0000-4000-8000-000000000001'
    );
  end loop;
end $$;

-- profiles だけは扱いが違う。
-- 新規ユーザー作成トリガー（handle_new_user）が走る時点では、その人の profiles 行が
-- まだ無いため current_store_id() は null を返す。既定店舗へのフォールバックに頼らず、
-- 招待・作成時に呼び出し側が store_id を明示すること（Step C で NOT NULL 制約と
-- あわせて詰める）。
comment on column public.profiles.store_id is
  'スタッフの所属店舗。新規作成時はトリガーからでは解決できないため、呼び出し側で明示すること。';
