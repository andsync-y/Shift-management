-- 領収書の支払手段（カード/現金/個人立替）。
-- OCRがレシートの印字（クレジット・現金・お預り等）から自動判定して保存し、
-- 一覧で手修正できる。freee用CSVの「支払手段」列と、カード払い除外
-- （freeeにカード連携がある場合の二重計上防止）に使う。null=不明。
alter table public.receipts
  add column if not exists payment_method text
    check (payment_method in ('card', 'cash', 'personal'));
