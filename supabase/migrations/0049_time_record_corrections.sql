-- 勤怠の「補正」フラグ
--
-- 出勤・退勤の時刻が、入力した時点より過去の時刻で記録・変更されたものを「補正」とする。
--   例）打刻を忘れて、あとから管理画面で 9:30 と入力した／前日の退勤を翌朝に直した
-- LINE・キオスクの打刻はサーバー時刻（= 今）で記録されるため補正にはならない。
--
-- 判定はトリガーで行う（アプリのどの経路から書き込んでも同じ基準になるように）。
--   - 入力時刻 < 今 - 5分 なら補正（通信遅延などの数分のずれは許容）
--   - 一度付いた補正フラグは消さない（あとで別の値に直しても補正の事実は残る）
--   - 管理画面の編集は分単位で送られてくるため、分が同じなら元の値（秒まで）を残し、
--     触っていない側の時刻が「秒が落ちただけ」で補正扱いになるのを防ぐ

alter table public.time_records
  add column if not exists in_corrected boolean not null default false,
  add column if not exists out_corrected boolean not null default false;

create or replace function public.time_records_mark_corrected()
returns trigger
language plpgsql
as $$
declare
  grace constant interval := interval '5 minutes';
begin
  if tg_op = 'INSERT' then
    new.in_corrected := coalesce(new.in_corrected, false)
      or (new.clock_in is not null and new.clock_in < now() - grace);
    new.out_corrected := coalesce(new.out_corrected, false)
      or (new.clock_out is not null and new.clock_out < now() - grace);
    return new;
  end if;

  -- UPDATE：分単位で同じなら変更なしとみなし、元の値を保つ
  if new.clock_in is not null and old.clock_in is not null
     and date_trunc('minute', new.clock_in) = date_trunc('minute', old.clock_in) then
    new.clock_in := old.clock_in;
  end if;
  if new.clock_out is not null and old.clock_out is not null
     and date_trunc('minute', new.clock_out) = date_trunc('minute', old.clock_out) then
    new.clock_out := old.clock_out;
  end if;

  new.in_corrected := old.in_corrected or new.in_corrected
    or (new.clock_in is distinct from old.clock_in
        and new.clock_in is not null and new.clock_in < now() - grace);
  new.out_corrected := old.out_corrected or new.out_corrected
    or (new.clock_out is distinct from old.clock_out
        and new.clock_out is not null and new.clock_out < now() - grace);
  return new;
end;
$$;

drop trigger if exists trg_time_records_mark_corrected on public.time_records;
create trigger trg_time_records_mark_corrected
  before insert or update on public.time_records
  for each row execute function public.time_records_mark_corrected();

-- 既存データの推定（トリガー導入前の分）
-- 打刻はミリ秒まで記録されるため、秒・ミリ秒がちょうど 0 の時刻は管理画面で入力・変更されたもの。
-- そのうち、最後に保存された時点より5分以上前の時刻を補正とみなす。
-- ※ 退勤だけを直した場合も出勤の秒が落ちるため、過去分は出勤側が補正扱いになることがある（推定）。
update public.time_records
set
  in_corrected = in_corrected or (
    clock_in is not null
    and date_trunc('minute', clock_in) = clock_in
    and greatest(created_at, updated_at) > clock_in + interval '5 minutes'
  ),
  out_corrected = out_corrected or (
    clock_out is not null
    and date_trunc('minute', clock_out) = clock_out
    and greatest(created_at, updated_at) > clock_out + interval '5 minutes'
  )
where clock_in is not null;
