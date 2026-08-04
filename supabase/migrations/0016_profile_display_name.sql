-- =====================================================================
-- 表示名（ニックネーム）の追加
-- =====================================================================
-- 苗字だとスタッフ同士で誰か分かりにくいため、表示用の短い名前（ローマ字の下の名前など）を
-- profiles.display_name に持たせ、画面の短い名前表示はこれを優先する。
-- 未設定なら従来どおり苗字（full_name の先頭）を表示。
-- =====================================================================

alter table profiles
  add column if not exists display_name text;

-- 既存スタッフへ初期値を投入（氏名の苗字で照合）
update profiles set display_name = 'AINA'   where full_name like '福田%' and display_name is null;
update profiles set display_name = 'KAYO'   where full_name like '紙坂%' and display_name is null;
update profiles set display_name = 'HANA'   where full_name like '桑原%' and display_name is null;
update profiles set display_name = 'KIYO'   where full_name like '二俣%' and display_name is null;
update profiles set display_name = 'AYU'    where full_name like '川島%' and display_name is null;
update profiles set display_name = 'MIYUKA' where full_name like '橋本%' and display_name is null;
update profiles set display_name = 'DAYA'   where full_name like '佐藤%' and display_name is null;
