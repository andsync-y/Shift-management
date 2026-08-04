-- =====================================================================
-- 固定費（毎月の定額費用）＋ 月次の経常利益・キャッシュ収支
-- =====================================================================
-- 家賃・ロイヤリティ・広告など毎月定額の費用を登録し、月次P&Lに反映する。
-- pl_expense=false の項目（借入返済など）は経常利益から除外し、キャッシュ収支でのみ控除する。
-- start_month / end_month で適用月を限定できる（例: リジョブ〜2026-07、公庫2026-08〜）。
-- =====================================================================

create table if not exists fixed_costs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  amount      numeric(12, 0) not null default 0,
  category    text,                 -- 地代家賃/広告宣伝費/水道光熱費/通信費/保険料/消耗品費/ロイヤリティ/借入返済 等
  pl_expense  boolean not null default true,  -- false=借入返済等（経常利益から除外）
  start_month text check (start_month is null or start_month ~ '^\d{4}-\d{2}$'),
  end_month   text check (end_month is null or end_month ~ '^\d{4}-\d{2}$'),
  note        text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_fixed_costs_updated before update on fixed_costs
  for each row execute function set_updated_at();
create trigger trg_audit_fixed_costs after insert or update or delete on fixed_costs
  for each row execute function audit_trigger();

alter table fixed_costs enable row level security;
create policy "固定費はオーナーのみ" on fixed_costs for all using (is_super_admin()) with check (is_super_admin());

-- 初期データ（提供された固定費）
insert into fixed_costs (name, amount, category, pl_expense, start_month, end_month, sort_order) values
  ('家賃',                   163000, '地代家賃',     true,  null,       null,       1),
  ('駐車場代',                15000, '地代家賃',     true,  null,       null,       2),
  ('ロイヤリティ',           100000, 'ロイヤリティ', true,  null,       null,       3),
  ('FC広告協賛',              12000, '広告宣伝費',   true,  null,       null,       4),
  ('光熱費',                  30000, '水道光熱費',   true,  null,       null,       5),
  ('広告',                   150000, '広告宣伝費',   true,  null,       null,       6),
  ('HPB',                     60000, '広告宣伝費',   true,  null,       null,       7),
  ('リジョブ',                60000, '広告宣伝費',   true,  null,       '2026-07',  8),
  ('LINE公式アカウント',        5000, '通信費',       true,  null,       null,       9),
  ('コスモウォーター',          7600, '消耗品費',     true,  null,       null,      10),
  ('消耗品代',                10000, '消耗品費',     true,  null,       null,      11),
  ('賠償保険',                22000, '保険料',       true,  null,       null,      12),
  ('借入返済（祖母）',         20000, '借入返済',     false, null,       null,      20),
  ('日本政策金融公庫 返済',   127000, '借入返済',     false, '2026-08',  null,      21);
