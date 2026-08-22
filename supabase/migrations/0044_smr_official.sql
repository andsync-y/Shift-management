-- 標準報酬月額の正式決定額（年金機構「資格取得確認および標準報酬決定通知書」の額）。
--
-- 標準報酬月額は資格取得時決定・定時決定（4〜6月平均）で決まり、次の改定まで固定される。
-- これまでは当月報酬から等級表を引く簡易方式だったため、月々の残業やバックで
-- 等級が動いてしまい、通知書の額と一致しなかった（例: 通知300千円 vs 推計280千円）。
-- ここに通知書の額を入れると、以後はその額で保険料を計算する（null なら従来の推計）。
alter table public.profiles
  add column if not exists smr_official integer
    check (smr_official is null or (smr_official >= 58000 and smr_official <= 1390000));

comment on column public.profiles.smr_official is
  '標準報酬月額（年金機構の決定通知書の額・円）。設定時はこの額で社会保険料を計算する。null=当月報酬から推計';
