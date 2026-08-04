-- 本部システム(zn-stretch)から1日1回取得するKPIスナップショットを保持する。
-- 取得は別ランナー(Playwright)→保護API→ここに保存。kioskは最新スナップショットを表示する。
create table if not exists fc_kpi (
  id         uuid primary key default gen_random_uuid(),
  as_of      date not null unique,                 -- スナップショット取得日
  data       jsonb not null default '{}'::jsonb,    -- { yesterday:{...}, month:{...} }
  updated_at timestamptz not null default now()
);

create trigger trg_fc_kpi_updated before update on fc_kpi
  for each row execute function set_updated_at();

alter table fc_kpi enable row level security;
create policy "KPIはオーナーのみ" on fc_kpi for all using (is_super_admin()) with check (is_super_admin());
