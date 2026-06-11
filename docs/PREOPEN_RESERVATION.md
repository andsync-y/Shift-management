# プレオープン 簡易予約システム（モデル客）

プレオープン3日間、スタッフが各自「知り合い＝モデル客」を時間枠に登録する簡易予約。
1枠＝ベッド4台ぶん（`PREOPEN_BEDS`）まで。施術90分前提。ベッド番号は管理せず人数のみ。

## 仕様

- **対象日・枠は固定**（`src/lib/preopen.ts` の `PREOPEN_DAYS`）。
  - 6/17・6/18：15:00–16:30 / 16:30–18:00（午前は研修）
  - 6/19：13:00–14:30 / 14:30–16:00 / 16:00–17:30
- **スタッフ各自が登録**。ログイン中のスタッフが自分の客を枠に入れる。
- **1枠4名上限**はサーバーアクションでチェック（`addReservation`）。満席なら拒否。
- **削除は本人ぶんのみ**（RLS＋UI）。オーナーは誰のでも可。
- 枠の空き状況（n/4）は全ログインユーザーが閲覧可（RLSのselectは `auth.uid() is not null`）。

## 画面・導線

- スタッフ画面 `/staff` 右上「プレオープン予約 →」→ `/staff/preopen`。
- `/staff/preopen` は3日×各ラウンドを表示。空き枠に名前を入れて「この枠に予約」。
- オーナーは管理ナビ「プレオープン」→ `/admin/preopen` で**全体の予約状況**（合計・満席枠数・各枠の客名と担当）を確認。
  オーナーは `isAdmin` 扱いで**誰の予約でも削除**できる（RLSの削除ポリシーが本人/管理者を許可）。

## DBマイグレーション（要適用）

`supabase/migrations/0010_preopen_reservations.sql` を **Supabase に適用**して初めて動く
（Supabase SQL Editor で実行、または `supabase db push`）。テーブル `preopen_reservations`。

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `supabase/migrations/0010_preopen_reservations.sql` | テーブル＋RLS |
| `src/lib/preopen.ts` | 日付・ラウンド・ベッド数の固定設定 |
| `src/app/staff/preopen/page.tsx` | スタッフ予約画面（サーバー） |
| `src/app/admin/preopen/page.tsx` | オーナー向け 予約状況（合計/満席数＋同グリッド・isAdmin） |
| `src/app/staff/preopen/PreopenBooking.tsx` | 予約グリッド（クライアント） |
| `src/app/staff/preopen/actions.ts` | 登録/削除（4名上限チェック） |
