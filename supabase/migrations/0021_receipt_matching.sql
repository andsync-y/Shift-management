-- =====================================================================
-- 経理システム③ 領収書 ⇔ カード明細 の自動マッチング
-- =====================================================================
-- 条件: 日付が ±3日以内 かつ 金額が完全一致。最も日付が近い1件に紐付ける。
-- すでに紐付け済みのレコードは対象外（二重紐付け防止）。
-- =====================================================================

-- 領収書側が確定値を持ったとき → 未紐付けのカード明細に紐付ける
create or replace function match_receipt_to_card() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if new.detected_amount is null or new.detected_date is null then
    return new;
  end if;
  -- まだどのカード明細にも紐付いていない領収書のみ対象
  if exists (select 1 from card_transactions where receipt_id = new.id) then
    return new;
  end if;

  select ct.id into target
  from card_transactions ct
  where ct.receipt_id is null
    and ct.amount = new.detected_amount
    and ct.transaction_date between new.detected_date - 3 and new.detected_date + 3
  order by abs(ct.transaction_date - new.detected_date), ct.created_at
  limit 1;

  if target is not null then
    update card_transactions set receipt_id = new.id where id = target;
  end if;
  return new;
end;
$$;

-- カード明細が追加されたとき → 未紐付けの領収書に紐付ける
create or replace function match_card_to_receipt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if new.receipt_id is not null then
    return new;
  end if;

  select r.id into target
  from receipts r
  where r.detected_amount = new.amount
    and r.detected_date between new.transaction_date - 3 and new.transaction_date + 3
    and not exists (select 1 from card_transactions c2 where c2.receipt_id = r.id)
  order by abs(r.detected_date - new.transaction_date), r.created_at
  limit 1;

  if target is not null then
    new.receipt_id := target;
  end if;
  return new;
end;
$$;

-- 領収書: INSERT と、AI解析で detected 値が入る UPDATE の両方で発火
create trigger trg_match_receipt
  after insert or update of detected_amount, detected_date on receipts
  for each row execute function match_receipt_to_card();

-- カード明細: INSERT 前に紐付け先を確定（new.receipt_id をセット）
create trigger trg_match_card
  before insert on card_transactions
  for each row execute function match_card_to_receipt();
