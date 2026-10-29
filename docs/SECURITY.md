# セキュリティ（DBアクセス制御）

マイグレーション `0047_security_hardening.sql` で入れた制御の要点。コードが正、ここは追従。

## 方針
- **機微情報（口座・初期パスワード・LINE ID・カレンダートークン・時給）は本人とオーナーだけが読める。**
- スタッフ画面が他人の情報を必要とするとき（シフト表の氏名・色）は、`staff_directory` ビュー経由で読む。
  `profiles` を `select("*")` で読むのは**オーナー画面（/admin）と service role（API・cron）だけ**。

## 現在の制御
| 対象 | 制御 |
|---|---|
| `profiles` SELECT | 本人 or オーナー（`is_super_admin()`） |
| `profiles` UPDATE | 本人 or オーナー。ただしトリガー `profiles_guard_self_update` が、オーナー・service role 以外には **表示色・電話・フリガナ以外の変更を禁止**（role の自己昇格を防ぐ） |
| `profiles` INSERT | オーナー、または本人かつ `role='staff'` |
| `staff_directory` ビュー | 同店舗の `id/full_name/display_name/display_color/role/is_active/work_status/store_id` のみ。意図的に SECURITY DEFINER |
| `v_labor_cost_*` / `v_expense_monthly` / `v_pl_monthly` | `security_invoker`（RLSが効く）。anon の権限なし。スタッフは自分の分だけ、経費・P&Lはオーナーのみ |
| SECURITY DEFINER 関数 | トリガー専用（`audit_trigger` ほか5つ）は EXECUTE を剥奪。`is_super_admin` / `current_store_id` はRLSが呼ぶので公開のまま |

## 開発ルール
- スタッフ向け画面で他人の `profiles` を読みたくなったら、`staff_directory` に列を足す（機微列は足さない）。
- 新しいビューは `with (security_invoker = true)` で作り、anon に権限を付けない。
- 新しい `profiles` 列を、スタッフ本人が編集できるようにする場合は、トリガーの許可リストに明示的に足す。

## 未対応（残課題）
- `profiles.initial_password` は平文のまま保存（他人からは読めなくなったが列は残る）。廃止して初回ログイン時の変更必須に移行するのが望ましい。
- Supabase Auth の「漏えいパスワード検査」はダッシュボードでの手動有効化が必要。
- 口座情報は `profiles` に同居（オーナー・本人のみ閲覧）。さらに分離するなら専用テーブルへ。
