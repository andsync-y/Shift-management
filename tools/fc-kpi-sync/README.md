# fc-kpi-sync（本部KPIの日次取得）

本部システム(zn-stretch)からKPIをPlaywrightで取得し、アプリの保護API `/api/kpi/ingest` へ送る。
**Vercelでは動かない**ため、GitHub Actions（cron）/ ローカル / VPS など Chromium が動く環境で実行する。

## 取得→保存→表示の流れ
1. このスクリプトが本部にログイン→KPIを読み取り→`/api/kpi/ingest` にPOST
2. アプリが `fc_kpi` テーブルへ保存（migration 0032）
3. kioskが `/api/kiosk/kpi` で最新を読み、画面に表示
4. 取得が未整備/失敗の間は、管理画面「運営 > 店舗KPI」で**手入力**して表示できる

## セットアップ
```
cd tools/fc-kpi-sync
npm install
npx playwright install chromium
```

## 環境変数（Secretに置く・リポジトリやチャットに書かない）
| 変数 | 例 |
|---|---|
| `FC_LOGIN_URL` | https://system.zn-stretch.com/login |
| `FC_USER` / `FC_PASS` | 本部ログインID/PW（定期的に変更） |
| `APP_INGEST_URL` | https://shift.andsync.jp/api/kpi/ingest |
| `KPI_INGEST_SECRET` | アプリ側の環境変数と同じ値 |
| （任意）`FC_USER_SELECTOR` / `FC_PASS_SELECTOR` / `FC_SUBMIT_SELECTOR` | ログイン欄のCSS |

## まず試す（送信せず内容だけ確認）
```
DRY_RUN=1 FC_LOGIN_URL=... FC_USER=... FC_PASS=... npm run sync
```

## ⚠️ 実装が必要な箇所
`sync.mjs` の `extractMonth` / `extractYesterday` は、本部画面に合わせて**セレクタ・遷移を実機で確認して埋める**こと
（どのページにどの数字があるか）。許可のうえ、対象ページのHTML/スクショを共有してもらえれば確定できる。

## 定期実行（GitHub Actions）
`.github/workflows/fc-kpi-sync.yml` を用意済み（日次 07:00 JST）。リポジトリの Settings → Secrets に上記を登録すれば動く。
2段階認証が有効だと自動ログインは不可。画面変更で壊れたら `extract*` を更新する。
