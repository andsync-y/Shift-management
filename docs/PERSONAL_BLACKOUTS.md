# 個別予定（不可時間）＝タイムツリー取り込み

特定スタッフ（例：二俣・川島の新体操教室。夏休みは不定期で体育館予約次第）の外部予定を
取り込み、その時間帯はシフト生成で割り当てないようにする仕組み。

## 仕組み

- テーブル **`staff_blackouts`**（staff_id, blackout_date, start_time, end_time, title, source）。
  - `start_time`/`end_time` が NULL の行は**終日不可**。
  - RLS：閲覧は本人/管理者、編集は管理者のみ。
- **タイムツリーのスクショ → Claude画像認識で予定抽出**（`src/lib/timetree/extract.ts`）。
  - 抽出結果を管理画面でプレビュー・編集してから保存（誤読の補正前提）。
  - モデルは `TIMETREE_MODEL`（既定 `claude-opus-4-8`）。`ANTHROPIC_API_KEY` 未設定なら無効。
- **シフト生成での扱い**：`blackoutsToTimeOff()`（`src/lib/blackouts.ts`）で `staff_blackouts` を
  `time_off` と同じ「不可時間」に変換し、`generatePeriodShifts` / `generatePeriodShiftsWithClaude`
  に合流。ソルバーは (staff_id, 日付, 時間帯重なり) で判定するため、その時間は割り当てられない。

## 画面・導線

- 管理ナビ「個別予定」→ `/admin/blackouts`。
  - 対象スタッフ・年を選び、**タイムツリーの画像を選んで解析** → 行を確認・修正 → 保存。
  - 下に登録済みの不可時間一覧（削除可）。
- 時刻が空の予定は終日不可として登録。

## 7・8月の運用（二俣・川島）

- 固定シフトでの常時勤務が難しい月は、各自の固定シフトを外す/減らし、
  体育館予約が確定するたびに**画像を送ってもらい取り込む**。生成時にその時間を避ける。

## DBマイグレーション（要適用）

`supabase/migrations/0014_staff_blackouts.sql` を Supabase に適用（SQL Editor または `supabase db push`）。

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `supabase/migrations/0014_staff_blackouts.sql` | テーブル＋RLS |
| `src/lib/timetree/extract.ts` | タイムツリー画像→予定抽出（Claude vision） |
| `src/lib/blackouts.ts` | 不可時間→time_off変換・月範囲ヘルパ |
| `src/app/admin/blackouts/page.tsx` | 取り込み画面（サーバー） |
| `src/app/admin/blackouts/BlackoutManager.tsx` | 取り込み/編集/一覧（クライアント） |
| `src/app/admin/blackouts/actions.ts` | 抽出/保存/削除 |
| `src/app/admin/shifts/actions.ts` | 生成時に不可時間を合流 |
