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
- **写真は出勤時のみ**。出勤を押した瞬間だけ**カメラを起動して1枚撮り、すぐ停止**（オンデマンド＝
  常時ONにしないので電池・privacyに配慮）。**横480px・JPEG**。退勤時は撮影しない＝1人1日1枚。
  - 撮影〜停止で約1秒。許可は事前付与済みなので毎回のプロンプトは出ない。
- 出勤中の人は「退勤する」、未出勤は「出勤する」を自動判定（`time_records` の未退勤レコード基準）。
- 打刻すると「◯◯さん、おはようございます！hh:mm 出勤を記録しました」等を表示し、一覧を更新。
- カメラ不可（権限拒否等）でも打刻は通る（写真なしで記録）。
- 画面下部に**シフトカレンダー**を表示（管理画面と同じ `ShiftCalendarView`・月/週切替・スタッフ絞り込み）。
  既定は当月。見出し横の**前月/翌月**ボタンで切替できる。データは
  `/api/kiosk/shifts?token=...&month=YYYY-MM`（KIOSK_TOKEN保護・下書き期間は除外）で10分ごとに更新。
- **当日**は日付の背景に**うすい赤丸**を表示（kiosk画面のみ・日付の位置は不変＝`::before` で背景に敷く）。
- ヘッダーに**書類印刷ボタン**「📄 カウンセリングシート」「📄 回数券 規約」。アプリに保持した
  ファイルを全画面表示して印刷する（シフト印刷と同じ使用感）。
  - 保持先：Storage バケット **`documents`**（非公開・migration 0030）。固定パス
    `counseling` / `ticket-terms` に upsert で差し替え（URL不変）。
  - アップロード：管理画面 **「運営 > 店舗書類」**（`/admin/documents`、オーナー専用）。PDF/画像可。
  - 表示・印刷：`/kiosk/doc/[type]`。`/api/kiosk/doc?token=...&type=...`（KIOSK_TOKEN保護・同一
    オリジン配信）を取得し、**PDFは PDF.js で各ページを canvas に描画**してページ内に表示、画像は
    `<img>` で表示 → 「🖨 印刷」で `window.print()`（Brother iPrint&Scan 等）。
    ※ Android Chrome は PDF を iframe 表示できないため、PDF.js で描画している（worker は jsDelivr CDN）。
- token 未設定の端末（例: PCでtoken無しで開いた）では設定案内を表示する。
- ヘッダーの **「🖨 シフト表を印刷」** → `/kiosk/print`。**kioskと同じカレンダー表示（`ShiftCalendarView`）
  そのまま**を **A4横**で印刷する（ページ専用 `@page { size: A4 landscape }`、印刷時は toolbar 非表示・色保持）。
  `window.print()` で Brother iPrint&Scan 等の印刷サービスを選択。前月/翌月の切替可。
  トークンは localStorage から読むので、印刷ページにトークンを付けなくてよい。
  ※ Android で向きが縦になる場合は印刷ダイアログで「横」を選ぶ。

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
