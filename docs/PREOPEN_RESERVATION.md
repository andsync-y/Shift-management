# プレオープン 簡易予約システム（モデル客）

プレオープン4日間（6/16火〜6/19金）、スタッフが各自「知り合い＝モデル客」を時間枠に登録する簡易予約。
施術90分・最終受付19:00（20:30終わり）。ベッド番号は管理せず人数のみ。

## 受付枠（`src/lib/preopen.ts` の `PREOPEN_DAYS`）

| 日 | 受付 | 補足 |
|---|---|---|
| 6/16(火) | 14:30 / 16:00 / 17:30 / 19:00 | 研修・店舗ルール 13:00–14:30 |
| 6/17(水) | 14:30 / 16:00 / 17:30 / 19:00 | 研修・店舗ルール 13:00–14:30 |
| 6/18(木) | 13:00 / 14:30 / 16:00 / 17:30 / 19:00 | |
| 6/19(金) | 13:00 / 14:30 / 16:00 / 17:30 / 19:00 | |

枠は `buildRounds(start, close="20:30")` で90分刻み生成。

## 出勤表と受付数

**プレオープン専用シフトは DB の `preopen_shifts` で管理**し、オーナーが
`/admin/preopen` の「シフトを編集」から変更できる（通常運用の週次固定シフト fixed_shifts とは独立）。

- **各枠の受付数** = min(ベッド4台, 枠の開始〜終了まで施術に入れるスタッフ数)。
  `computeCapacities(shifts)`（純関数・`src/lib/preopen.ts`）で算出。`is_training=true` は研修のみ（施術に数えない）。
- 初期シフトの雛形は `DEFAULT_PREOPEN_STAFFING`（`preopen.ts`）。編集画面の「初期シフトに戻す」で
  姓照合により流し込む。**DBが空のうちは受付数が全て0**になるので、初回はここから読み込む。
- 21:00上がりは最終施術後の閉め作業込み。

### 初期シフト雛形（`DEFAULT_PREOPEN_STAFFING`）

| 日 | 出勤 |
|---|---|
| 6/16(火) | 福田 13–21・佐藤 13–21・紙坂 13–19 |
| 6/17(水) | 二俣 13–21・川島 13–21・橋本 13–21・桑原 13–18 |
| 6/18(木) | 福田 13–21・橋本 13–21・二俣 13–16・川島 13–16 |
| 6/19(金) | 佐藤 13–21・桑原 13–16・紙坂 13–19 |

## 仕様

- **スタッフ各自が登録**。ログイン中のスタッフが自分の客を枠に入れる。
- **担当区分**：登録時に「自分が施術する」か「フリー（誰が施術してもよい）」を選ぶ（`is_free`）。
  旧データ（is_free無し）はオーナー登録分のみフリー扱い。
- 上限チェックはサーバーアクション `addReservation`（受付数超過・受付なし枠を拒否）。
- **削除は本人ぶんのみ**（RLS＋UI）。オーナーは誰のでも可。
- 枠の空き状況は全ログインユーザーが閲覧可（RLSのselectは `auth.uid() is not null`）。
- **枠外予約の救済**：受付時間の変更前に入った予約（現在の枠に一致しない時刻）は
  「時間変更が必要な予約」として一覧表示され、削除→入れ直しできる。

## 画面・導線

掲載順は **シフト → 予約 → 予約一覧**（スタッフ `/staff/preopen`・オーナー `/admin/preopen` 共通）。

1. **シフト**（`PreopenRoster`）：通常のシフト表と同じタイムライン表示（`.tl`・13–22時）。
   スタッフ色のバーで4日分の勤務を可視化。「研」＝研修のみ（バー右に注記）。色は profiles.display_color（姓→色）。
2. **予約**（`PreopenBooking`）：日付ごとに1行。
   - 日付見出しの右に**空き状況をインライン表示**（例 `14:30–16:00 0/3`、満＝「満」、受付なし＝「—」）。
   - 行は「予約枠プルダウン → 名前入力 → **自分が施術する / フリー（誰でも）** → 予約」。
     担当区分は `is_free` カラム（migration 0011）。
3. **予約一覧**：ページ最後に全予約のカレンダー（日付×時間帯・チップ）。
   旧受付時間の予約は「要時間調整」で別掲。削除は本人のみ（オーナーは全件）。

オーナー画面（`/admin/preopen`）はシフトの下に **「シフトを編集」**（`PreopenShiftEditor`）があり、
日付ごとにスタッフ・勤務時間・研修のみを編集→保存できる（`savePreopenShifts`/`resetPreopenShifts`）。

- スタッフ画面 `/staff` 右上「プレオープン予約 →」→ `/staff/preopen`。
- オーナーは管理ナビ「プレオープン」→ `/admin/preopen`。

## DBマイグレーション（要適用）

以下を **Supabase に適用**して初めて動く（SQL Editor で実行、または `supabase db push`）。

- `0010_preopen_reservations.sql`：テーブル `preopen_reservations` ＋ RLS
- `0011_preopen_is_free.sql`：担当区分カラム `is_free`
- `0012_preopen_shifts.sql`：プレオープン出勤シフト `preopen_shifts`（オーナー編集）
- `0013_seed_preopen_shifts.sql`：初期シフト投入（姓で profiles 照合・重複なし。ボタン「初期シフトに戻す」と同等）

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `supabase/migrations/0010_preopen_reservations.sql` | テーブル＋RLS |
| `supabase/migrations/0011_preopen_is_free.sql` | 担当区分 `is_free` |
| `supabase/migrations/0012_preopen_shifts.sql` | 出勤シフト `preopen_shifts`（オーナー編集） |
| `src/lib/preopen.ts` | 日程・受付枠・受付数算出(computeCapacities)・初期雛形 |
| `src/lib/preopen-data.ts` | 表示データ一括取得（profiles/予約/シフト→受付数・色） |
| `src/app/admin/preopen/PreopenShiftEditor.tsx` | シフト編集UI（オーナー） |
| `src/app/admin/preopen/actions.ts` | シフト保存/初期化（オーナー） |
| `src/app/staff/preopen/page.tsx` | スタッフ予約画面（サーバー） |
| `src/app/admin/preopen/page.tsx` | オーナー向け 空き状況表＋シフト表＋予約グリッド（isAdmin） |
| `src/app/staff/preopen/PreopenRoster.tsx` | シフトのタイムライン表示（共用・色は profiles.display_color） |
| `src/app/staff/preopen/PreopenBooking.tsx` | 予約フォーム＋予約一覧（クライアント） |
| `src/app/staff/preopen/actions.ts` | 登録/削除（受付数チェック） |
