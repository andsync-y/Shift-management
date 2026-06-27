# タブレット打刻キオスク（/kiosk）

受付タブレットで**名前ボタンを押すだけ**で出勤/退勤を打刻する画面。誰でも押せてしまう
代理打刻を抑止するため、**打刻の瞬間に前面カメラでセルフィーを1枚記録**する。
※ 顔認証（照合）はしない＝即時。写真は「本人だったか」を後で確認するための証拠。

## 使い方（タブレット設定）

1. `KIOSK_TOKEN`（ランダムな長い文字列）を Vercel の環境変数に設定。
2. Storage バケット **`punch-photos`（非公開）** を用意（migration 0028 で自動作成）。
3. タブレットのブラウザで一度だけ `https://shift.andsync.jp/kiosk?token=<KIOSK_TOKEN>` を開く。
   - token は端末の localStorage に保存され、以後はURLにtokenが無くても動く（URLからは消える）。
   - カメラ使用を**許可**する（HTTPSのみ・ホーム画面に追加して全画面推奨）。

## 画面・挙動

- **本日シフトのある人だけ**をボタン表示（開始時刻順）。下書き期間のシフトは除外。
- カメラは常時プレビュー（右上に小窓）。**写真は出勤時のみ**、押した瞬間の映像を**横480px・JPEG**で1枚取得（退勤時は撮影しない＝1人1日1枚）。
- 出勤中の人は「退勤する」、未出勤は「出勤する」を自動判定（`time_records` の未退勤レコード基準）。
- 打刻すると「◯◯さん、おはようございます！hh:mm 出勤を記録しました」等を表示し、一覧を更新。
- カメラ不可（権限拒否等）でも打刻は通る（写真なしで記録）。

## データ・確認

- `time_records.source = 'kiosk'`、写真は `in_photo_url`（出勤時のみ。`punch-photos` のパス）。
- オーナーは「勤怠管理」一覧の各行で **📷出** リンクから写真を確認できる（署名URL・1時間有効）。
- **自動削除**：90日より古い写真は削除する（`purgeOldPunchPhotos`）。新規cronを足さず、毎日の
  `shift-reminder` cron 内で日次実行。手動・日数調整は
  `GET /api/cron/purge-punch-photos?key=<CRON_SECRET>&days=90`。

## 認証・セキュリティ

- `/api/kiosk/today`・`/api/kiosk/punch` は **`KIOSK_TOKEN`** で保護（未設定だと無効）。
- スタッフのログインは不要（共有タブレット運用）。本人特定は名前ボタン＋セルフィーで担保。
- 写真バケットは非公開。表示は service role の署名URLのみ。

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `src/app/kiosk/page.tsx` | キオスク画面（カメラ・名前ボタン・打刻） |
| `src/app/api/kiosk/today/route.ts` | 本日シフトのスタッフ＋打刻状態 |
| `src/app/api/kiosk/punch/route.ts` | 打刻記録＋セルフィー保存 |
| `supabase/migrations/0028_punch_photos.sql` | 写真URL列＋`punch-photos`バケット |
| `src/app/admin/timecards/page.tsx` | 打刻写真の署名URL発行 |

## 今後の拡張候補

- シフト予定時刻から大きく外れた打刻の警告表示。
- 保持日数（既定90日）の調整UI、退勤時撮影のON/OFF切替UI。
