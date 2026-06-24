-- =====================================================================
-- 経理システム① テーブル定義 ＋ 監査ログ（電子帳簿保存法対応）
-- =====================================================================
-- receipts（領収書/証憑）, ec_orders（EC注文）, card_transactions（カード明細）。
-- 変更・削除履歴は audit_logs にトリガーで自動追記（追記専用＝改ざん防止）。
-- 財務データは閲覧・編集ともオーナー（is_super_admin）のみ。
-- =====================================================================

-- 領収書・証憑 -------------------------------------------------------
create table if not exists receipts (
  id                uuid primary key default gen_random_uuid(),
  image_url         text not null,                 -- Supabase Storage のパス
  detected_date     date,                          -- AI解析: 日付
  detected_amount   numeric(12, 2),                -- AI解析: 金額
  detected_merchant text,                          -- AI解析: 支払先
  suggested_account text,                          -- AI提案: 勘定科目
  status            text not null default 'pending' check (status in ('pending', 'confirmed')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists receipts_date on receipts (detected_date);
create index if not exists receipts_amount on receipts (detected_amount);

-- EC注文（Amazon/楽天/Yahoo） ---------------------------------------
create table if not exists ec_orders (
  id           uuid primary key default gen_random_uuid(),
  mall_type    text not null check (mall_type in ('amazon', 'rakuten', 'yahoo')),
  order_id     text not null,
  order_date   date not null,
  items        jsonb not null default '[]'::jsonb, -- [{name, unit_price, qty}]
  total_amount numeric(12, 2) not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (mall_type, order_id)
);
create index if not exists ec_orders_date on ec_orders (order_date);
create index if not exists ec_orders_amount on ec_orders (total_amount);

-- カード明細（三井住友カード等） -------------------------------------
create table if not exists card_transactions (
  id               uuid primary key default gen_random_uuid(),
  transaction_date date not null,
  amount           numeric(12, 2) not null,
  merchant_name    text,
  receipt_id       uuid references receipts (id) on delete set null,
  ec_order_id      uuid references ec_orders (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists card_tx_date on card_transactions (transaction_date);
create index if not exists card_tx_amount on card_transactions (amount);
create index if not exists card_tx_receipt on card_transactions (receipt_id);

-- updated_at 自動更新 ------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_receipts_updated   before update on receipts          for each row execute function set_updated_at();
create trigger trg_ec_orders_updated  before update on ec_orders         for each row execute function set_updated_at();
create trigger trg_card_tx_updated    before update on card_transactions for each row execute function set_updated_at();

-- =====================================================================
-- 監査ログ（電子帳簿保存法：訂正・削除の履歴を残す）
-- =====================================================================
create table if not exists audit_logs (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   uuid,
  operation   text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid,                               -- auth.uid()（システム/サービスロール時は NULL）
  changed_at  timestamptz not null default now()
);
create index if not exists audit_logs_table_rec on audit_logs (table_name, record_id);
create index if not exists audit_logs_changed_at on audit_logs (changed_at);

-- 監査トリガー本体（INSERT/UPDATE/DELETE を1関数で記録）
create or replace function audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE') then
    insert into audit_logs (table_name, record_id, operation, old_data, new_data, changed_by)
    values (tg_table_name, old.id, 'DELETE', to_jsonb(old), null, auth.uid());
    return old;
  elsif (tg_op = 'UPDATE') then
    insert into audit_logs (table_name, record_id, operation, old_data, new_data, changed_by)
    values (tg_table_name, new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  else -- INSERT
    insert into audit_logs (table_name, record_id, operation, old_data, new_data, changed_by)
    values (tg_table_name, new.id, 'INSERT', null, to_jsonb(new), auth.uid());
    return new;
  end if;
end;
$$;

create trigger trg_audit_receipts          after insert or update or delete on receipts          for each row execute function audit_trigger();
create trigger trg_audit_ec_orders         after insert or update or delete on ec_orders         for each row execute function audit_trigger();
create trigger trg_audit_card_transactions after insert or update or delete on card_transactions for each row execute function audit_trigger();

-- =====================================================================
-- RLS（財務データはオーナーのみ。監査ログは閲覧のみ・追記専用）
-- =====================================================================
alter table receipts          enable row level security;
alter table ec_orders         enable row level security;
alter table card_transactions enable row level security;
alter table audit_logs        enable row level security;

create policy "経理データはオーナーのみ" on receipts          for all using (is_super_admin()) with check (is_super_admin());
create policy "経理データはオーナーのみ" on ec_orders         for all using (is_super_admin()) with check (is_super_admin());
create policy "経理データはオーナーのみ" on card_transactions for all using (is_super_admin()) with check (is_super_admin());

-- 監査ログ：オーナーは閲覧のみ。UPDATE/DELETE ポリシーは作らない（＝不可＝改ざん防止）。
-- INSERT は audit_trigger（security definer）が行うため一般ポリシー不要。
create policy "監査ログはオーナー閲覧のみ" on audit_logs for select using (is_super_admin());
