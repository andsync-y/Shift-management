# 店休・店舗お知らせ（日単位イベント）

特定の日を「店休」や「お知らせ（講習など）」として、シフトカレンダーの該当日に
バナー表示する機能。店休日・研修日・全員参加イベントをスタッフに周知する。

例：8/18 **店休** / アドバンス講習 / 10:00–17:00 / ※基本的に全員参加。

## データモデル（`store_events`）

| カラム | 内容 |
|---|---|
| `event_date` | 対象日（`YYYY-MM-DD`） |
| `kind` | `closed`=店休 / `note`=お知らせ（営業はする） |
| `title` | 見出し（例：アドバンス講習） |
| `body` | 補足メモ（任意・例：講師 金田さん） |
| `start_time` / `end_time` | 時間帯（任意。両方あれば「10:00–17:00」表示） |
| `all_hands` | ※基本的に全員参加（true でバッジ表示） |

マイグレーション：`supabase/migrations/0036_store_events.sql`

- 閲覧：全ログインユーザー（スタッフ含む）
- 編集：オーナー（`is_super_admin()`）のみ
- kiosk はサービスロールで取得するため RLS を回避して表示できる

## 表示（カレンダー）

`src/components/ShiftCalendarView.tsx` が `storeEvents` を受け取り、月ビュー・週ビュー
それぞれで該当日にバナー（`.cal-note`）を出す。店休は赤系、お知らせは青系。
店休日でもシフト行は消えないので、実シフト側も別途調整すること（店休なら該当日の
シフトを削除する）。

反映されるカレンダー：

| 画面 | ファイル |
|---|---|
| オーナー：シフト作成（月詳細） | `src/app/admin/shifts/[id]/page.tsx` |
| オーナー：ダッシュボード | `src/app/admin/page.tsx` |
| スタッフ：シフト確認 | `src/app/staff/page.tsx` |
| キオスク（タブレット） | `src/app/kiosk/page.tsx` ＋ API `src/app/api/kiosk/shifts/route.ts` |
| キオスク：印刷 | `src/app/kiosk/print/page.tsx` |

## 編集（管理画面）

`src/app/admin/shifts/[id]` の「店休・お知らせ」セクション（`StoreEventEditor.tsx`）で
日付・種別・内容・時間・全員参加・補足を追加／削除できる。

サーバーアクション：`src/app/admin/shifts/actions.ts` の
`addStoreEvent` / `deleteStoreEvent`。

## 補足

- 店休の自動打診（出勤打診エンジン）とは無関係。店休登録はシフトの増減を行わない
  ため、店休日の既存シフトは手動またはSQLで削除する必要がある。
