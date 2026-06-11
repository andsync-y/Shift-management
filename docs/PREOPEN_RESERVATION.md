# プレオープン 簡易予約システム（モデル客）

プレオープン3日間、スタッフが各自「知り合い＝モデル客」を時間枠に登録する簡易予約。
営業 13:00–22:00・施術90分。ベッド番号は管理せず人数のみ。

## 仕様

- **対象日・枠は固定**（`src/lib/preopen.ts` の `PREOPEN_DAYS`）。
  - 6/17(水)・6/18(木)・6/19(金)：13:00 / 14:30 / 16:00 / 17:30 / 19:00 / 20:30 開始の90分×6枠
- **各枠の受付数** = min(ベッド4台, その枠の間ずっと勤務しているスタッフ数)。
  - 勤務しているかは**固定シフト（fixed_shifts＝希望の勤務形態）**で判定
    （例：紙坂が水木16時までなら、水木の16:00以降の枠には数えない）。
  - 算出は `src/lib/preopen-capacity.ts`（fixed_shifts のRLSが本人/管理者のみのため
    service role＝`createAdminClient` で読む）。受付数0の枠は「受付なし」表示。
  - サーバーアクション `addReservation` でも同じ受付数で上限チェック。
- **スタッフ各自が登録**。ログイン中のスタッフが自分の客を枠に入れる。
- **オーナーが登録した予約は「担当：フリー」表示**（特定スタッフに紐付けない）。
- **削除は本人ぶんのみ**（RLS＋UI）。オーナーは誰のでも可。
- 枠の空き状況は全ログインユーザーが閲覧可（RLSのselectは `auth.uid() is not null`）。

## 画面・導線

- スタッフ画面 `/staff` 右上「プレオープン予約 →」→ `/staff/preopen`。
- `/staff/preopen` は3日×各ラウンドを表示。空き枠に名前を入れて「この枠に予約」。
- オーナーは管理ナビ「プレオープン」→ `/admin/preopen`。
  - 冒頭に**3日×時間帯のコンパクトな空き状況表**（セル＝残り数、「満」「—（受付なし）」）。
  - その下に通常の予約グリッド。オーナーは `isAdmin` 扱いで**誰の予約でも削除**できる。

## DBマイグレーション（要適用）

`supabase/migrations/0010_preopen_reservations.sql` を **Supabase に適用**して初めて動く
（Supabase SQL Editor で実行、または `supabase db push`）。テーブル `preopen_reservations`。

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `supabase/migrations/0010_preopen_reservations.sql` | テーブル＋RLS |
| `src/lib/preopen.ts` | 日付・ラウンド・ベッド数の固定設定 |
| `src/lib/preopen-capacity.ts` | 枠ごとの受付数算出（固定シフト×ベッド数・service role） |
| `src/app/staff/preopen/page.tsx` | スタッフ予約画面（サーバー） |
| `src/app/admin/preopen/page.tsx` | オーナー向け 空き状況表＋予約グリッド（isAdmin） |
| `src/app/staff/preopen/PreopenBooking.tsx` | 予約グリッド（クライアント） |
| `src/app/staff/preopen/actions.ts` | 登録/削除（受付数チェック） |
