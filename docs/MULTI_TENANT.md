# マルチテナント化（store_id）

2号店の出店と、このシステムを他店舗へ提供する可能性に備えて、
全テーブルに「どの店舗の行か」を持たせる。

## なぜ今やるか

着手前の状態は、業務テーブル23個すべてに店舗を区別する列が無い**完全な単一店舗設計**だった。
一方で中身は打刻・シフト・給与・KPI・経費・P/Lまで育っている。

機能が増えてからテナント化すると、全テーブル・全クエリ・全RLSの改修に加えて
**稼働中データの移行**が要る。予約機能を載せる前の今が、いちばん安い。

## 3段階に分ける

本番で毎日、打刻と給与が動いている。一度に切り替えると、失敗したときに
スタッフが出勤打刻できなくなる。そのため後方互換を保ったまま3段階で進める。

| 段階 | 内容 | 状態 |
|---|---|---|
| **Step A** | `stores` テーブル作成、全業務テーブルへ `store_id` を追加（DEFAULT付き・NOT NULL）。**RLSは変更しない** | ✅ 適用済み |
| **Step B** | `store_id` の DEFAULT を「ログイン中ユーザーの店舗」にする。サービスロール経路の洗い出し | PR準備済み・**未適用** |
| Step C | RLSポリシーに店舗条件を追加、DEFAULT を外す | 未着手 |

**Step A だけでは複数店舗を安全に同居させられない。** Step C まで終えて初めて、
2店舗目のデータを入れてよい。

### Step A が既存を壊さない理由

1. `store_id` は NOT NULL だが **DEFAULT に現店舗のIDが入っている**。
   既存のアプリコードは `store_id` を渡さないが、DEFAULT が補うので INSERT は通る。
2. **RLSポリシーを一切変更していない**。権限判定は `auth.uid()` と `is_super_admin()` のまま。
3. 店舗が1つしか無い間は、絞り込みが無くても結果は変わらない。
4. ビュー（`v_labor_cost_*` / `v_pl_monthly` / `v_expense_monthly`）は
   すべて列を明示列挙しているため、列追加の影響を受けない（確認済み）。

## 適用状況

**Step A は 2026-09-07 深夜（閉店中）に本番へ適用済み。**
Supabase の移行履歴には `20260907165626_multi_tenant_store_id` として記録されている。

### ⚠️ `supabase db push` は使わないこと

適用時に判明したが、**本番DBの移行履歴には `0001`〜`0046` が1件も記録されていない**
（`list_migrations` の結果は `20260907165626` の1件のみ）。過去の移行は
SQL Editor などから手で当てられており、リポジトリのファイル名と履歴が同期していない。

この状態で `supabase db push` を実行すると、**既に適用済みの46ファイルを
再実行しようとして失敗するか、二重適用になる**。

適用は **Supabase ダッシュボードの SQL Editor に貼る**（または MCP の `apply_migration`）で行う。
履歴の同期は別途、腰を据えてやる課題として残す。

⚠️ **営業時間中に実行しない。** 打刻が止まると現場が困る。閉店後（22:00以降）か開店前に行う。
DDLはトランザクション内で実行されるため、途中で失敗しても全体がロールバックされる。

### 適用前チェック（実行済み・2026-09-07）

| 確認項目 | 結果 |
|---|---|
| 対象23テーブルの存在 | 23 / 23 |
| すでに `store_id` を持つテーブル | 0 |
| `gen_random_uuid()` の利用可否 | あり |
| `stores` テーブルの既存 | なし |
| `store_settings` の行数（一意制約が通るか） | 1 |

### 適用後の検証結果（2026-09-07・実測）

| 確認項目 | 結果 |
|---|---|
| `store_id` を持つ表 | **23**（すべて NOT NULL・DEFAULT・FK・索引つき） |
| `stores` の行数 | 1 |
| 既存データの紐付き | `time_records` 320件すべてが単一店舗 |
| 行数の変化 | なし（profiles 10／time_records 320／shifts 479／receipts 58／payroll_adjustments 1） |
| RLSポリシー数 | 43（うち `stores` の新規2件）。**既存41件は無変更** |
| `store_id` を参照するポリシー | **0**（設計どおり。Step C で追加する） |
| `npm run typecheck` | 通過 |
| `npm test` | **157件すべて成功** |

再確認したいときのクエリ:

```sql
select count(*) from information_schema.columns
where table_schema='public' and column_name='store_id';   -- 23

select store_id, count(*) from time_records group by 1;   -- 1行だけ
```

## 設計メモ

- 現店舗のIDは `00000000-0000-4000-8000-000000000001` に固定した。
  DEFAULT 句からリテラルとして参照する必要があるため。
- `current_store_id()` はログイン中ユーザーの所属店舗を返す。Step C の RLS で使う。
  Step A の時点ではどのポリシーからも参照していない。
- `profiles.store_id` はスタッフの所属店舗。`super_admin` が複数店舗を横断する扱いは
  Step C で決める（現状は全員が同一店舗）。
- `store_settings` は店舗につき1行になるよう一意制約を張った。
- バックアップ表（`shifts_backup_*`）とビュー（`v_*`）は対象外。

## 関連

- 予約機能の設計は、この Step C 完了後に着手する。
  先にテナントキーを入れておかないと、予約テーブルだけ後から作り直すことになる。


---

# Step B：DEFAULT を動的にする

## 方針：46か所を書き換えるのではなく、DEFAULT を賢くする

アプリ側の INSERT / UPSERT は **46か所**ある（`.insert(` 29 ＋ `.upsert(` 17）。
そのすべてに `store_id` を書き足すこともできるが、**1か所でも書き漏らすと
黙って既定店舗に書き込まれる**。レビューでも気づきにくい。

そこで DEFAULT 自体を変える。

```sql
alter table X alter column store_id set default coalesce(current_store_id(), '<既定店舗>');
```

| 呼び出し元 | `current_store_id()` | 結果 |
|---|---|---|
| ログイン中のユーザー操作 | その人の所属店舗 | **正しい店舗が入る** |
| サービスロール（`createAdminClient`） | `auth.uid()` が null → null | 既定店舗にフォールバック |

これで46か所のうち**ユーザー操作ぶんは自動的に正しくなる**。
アプリ側で明示が要るのは、下のサービスロール経路だけに絞られる。

## ⚠️ 2店舗目を入れる前に潰すこと（サービスロール経路）

以下は `createAdminClient()`（RLSをバイパス・`auth.uid()` が null）で書き込むため、
DEFAULT が**既定店舗にフォールバックする**。1店舗の間は正しく動くが、
2店舗目を入れると誤った店舗に書き込まれる。

`src/lib/store.ts` の `requireStoreId()` を使い、`store_id` を明示すること。

| 書込数 | ファイル | 対象テーブル |
|---|---|---|
| 3 | `src/lib/offers/engine.ts` | availability_preferences / profiles / shift_offers ほか |
| 3 | `src/app/admin/accounting/actions.ts` | card_transactions / monthly_sales / receipts |
| 2 | `src/app/api/cron/clock-reminder/route.ts` | clock_reminders / shifts / time_records |
| 1 | `src/app/api/timecard/punch/route.ts` | time_records |
| 1 | `src/app/api/line/webhook/route.ts` | time_records |
| 1 | `src/app/api/kpi/ingest/route.ts` | fc_kpi |
| 1 | `src/app/api/kiosk/punch/route.ts` | time_records |
| 1 | `src/app/api/accounting/receipt-upload/route.ts` | receipts |
| 1 | `src/app/api/accounting/receipt-ocr/route.ts` | receipts |
| 1 | `src/app/admin/staff/actions.ts` | profiles |

`profiles` は別枠。新規ユーザー作成トリガー（`handle_new_user`）が走る時点では
本人の `profiles` 行がまだ無く、自分の店舗を引けない。招待・作成時に呼び出し側で
`store_id` を明示すること。

## 適用手順

Step A と同じ。**営業時間中に実行しない。** `supabase db push` は使わない（下記参照）。

適用後の確認:

```sql
select table_name, column_default
from information_schema.columns
where table_schema='public' and column_name='store_id'
order by table_name;
-- すべて coalesce(current_store_id(), '00000000-...-0001'::uuid) になっているはず
```

---

# 🔴 別件で見つかった問題：適用されていないマイグレーションが5本ある

Step B の調査中に判明した。**コードが参照しているのに本番DBに存在しないテーブル**が5つある。

| テーブル | 定義しているマイグレーション | 本番DB |
|---|---|---|
| `shift_offers` | `0009_shift_offers.sql` | **無い** |
| `shift_offer_candidates` | `0009_shift_offers.sql` | **無い** |
| `staff_blackouts` | `0014_staff_blackouts.sql` | **無い** |
| `monthly_sales` | `0023_monthly_sales.sql` | **無い** |
| `absences` | `0045_absences.sql` | **無い** |

つまり **シフトオファー / 個人ブラックアウト / 月次売上 / 欠勤管理 の各機能は、
本番では動いていない**（該当コードに到達するとエラーになるはず）。

原因は移行履歴の同期ずれ（上記「`supabase db push` は使わないこと」と同根）。
`0001`〜`0046` が履歴に記録されていないため、どれが当たっていてどれが当たっていないのかを
DB側から判定できない状態だった。

**対応は Step C とは切り離して、別途フルの棚卸しが要る。**
この5本を適用するときは、`store_id` の追加も同時に行うこと（Step A の対象に入っていない）。
