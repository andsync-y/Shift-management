-- =====================================================================
-- 出勤打診（自動オファー）: 休み希望の承認で人員が不足したとき、
-- 他スタッフへ LINE で1人ずつ出勤を打診し、最初に承諾した人を自動で
-- シフトに反映する。誰も見つからなければオーナーに通知する。
-- =====================================================================
-- shift_offers            … 1件の「穴」を埋めるための打診（日付・必要数・状態）
-- shift_offer_candidates  … その打診で順番に声をかける候補スタッフのキュー
-- =====================================================================

create table if not exists shift_offers (
  id                uuid primary key default gen_random_uuid(),
  off_date          date not null,                              -- 穴の開いた日
  period_id         uuid references shift_periods (id) on delete set null,
  start_time        time,                                       -- 埋めたい時間帯（必要人数定義より）
  end_time          time,
  needed            smallint not null default 1 check (needed >= 0), -- 残り必要人数（承諾で減る）
  origin_request_id uuid references time_off_requests (id) on delete set null,
  -- open=打診中 / filled=充足 / failed=埋まらず終了 / canceled=取消
  status            text not null default 'open'
                    check (status in ('open', 'filled', 'failed', 'canceled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists shift_offers_status on shift_offers (status);
create index if not exists shift_offers_date on shift_offers (off_date);

create table if not exists shift_offer_candidates (
  id            uuid primary key default gen_random_uuid(),
  offer_id      uuid not null references shift_offers (id) on delete cascade,
  staff_id      uuid not null references profiles (id) on delete cascade,
  position      smallint not null,                              -- 声をかける順番（0始まり）
  -- queued=未連絡 / asked=打診中(返答待ち) / accepted=承諾 / declined=辞退 / skipped=無返答で次へ
  status        text not null default 'queued'
                check (status in ('queued', 'asked', 'accepted', 'declined', 'skipped')),
  asked_at      timestamptz,
  responded_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists shift_offer_candidates_offer on shift_offer_candidates (offer_id);
create index if not exists shift_offer_candidates_staff on shift_offer_candidates (staff_id);
-- タイムアウト判定（asked のものを素早く引く）
create index if not exists shift_offer_candidates_asked on shift_offer_candidates (status) where status = 'asked';

-- =====================================================================
-- Row Level Security : 閲覧はオーナーのみ。
-- 打診の作成・更新は LINE Webhook / Cron（service role）が RLS をバイパスして行う。
-- =====================================================================
alter table shift_offers           enable row level security;
alter table shift_offer_candidates enable row level security;

create policy "打診の閲覧は管理者" on shift_offers
  for select using (is_super_admin());
create policy "打診候補の閲覧は管理者" on shift_offer_candidates
  for select using (is_super_admin());
