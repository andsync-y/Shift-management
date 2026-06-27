# FC本部システム連携（勤怠・スタッフ情報の転記）

FC本部システム（`system.zn-stretch.com`）に毎月手入力している「勤務時間」「スタッフ
情報」を、本システムのデータから生成して転記を高速・正確にする仕組み。

本部には公開API・CSV取込が（ほぼ）無いため、**フル自動化はRPA一択**。本ドキュメントの
範囲は **Step 1（本部の協力不要・Vercelで完結する転記支援＋データAPI）**。RPAによる
完全自動入力（Step 2）はFC本部の許可が前提で、別ランナー（Vercel外）で段階導入する。

## Step 1（実装済み）

### スキーマ（`profiles` 追加列）

`supabase/migrations/0025_fc_hq_fields.sql`

| 列 | 型 | 意味 |
|---|---|---|
| `name_kana` | text | カナ氏名（本部「スタッフ管理」フォーム必須） |
| `work_status` | text | 在籍状況 `active`=在籍中 / `on_leave`=休職中 / `retired`=退職（既定 `active`） |

- 既存行は `is_active` から初期化（true→active, false→retired）。
- `work_status` を `active` 以外に変更すると `is_active=false` に連動し、シフト生成・
  各種「在籍中」一覧から外れる（`src/app/admin/staff/actions.ts`）。

### スタッフ編集（オーナーのみ）

`/admin/staff/[id]` の「プロフィール編集」に **カナ氏名 / 在籍状況** を追加。

### 転記支援画面

`/admin/timecards/fc-export?month=YYYY-MM`（オーナー専用、ナビ「運営 > FC本部 転記」）

- 本部「勤務時間」フォーム（氏名 / 勤務時間h / 勤務日数 / 遅刻欠勤）と
  「スタッフ管理」フォーム（カナ氏名 / 氏名 / 在籍状況 / 雇用形態）を、本部と同じ形の表で表示。
- 各セルはタップでクリップボードへコピーでき、手入力を高速・正確にする。
- 集計は勤怠管理（`src/app/admin/timecards/page.tsx`）と同じロジック
  （打刻 `clock_in`〜`clock_out` を合算、退勤まで完了した勤務日数をカウント）。
- 氏名は **本名 `full_name`**（本部は本名が必要なため、ローマ字の `display_name` は使わない）。
- 遅刻欠勤は自動判定が難しいため既定「無」（本部側で調整）。

### 保護JSON API

`GET /api/export/fc-hq?month=YYYY-MM&key=<CRON_SECRET>`

- 認証は `CRON_SECRET`（`Authorization: Bearer <secret>` または `?key=<secret>`）。未認証は401。
- 転記支援画面と同じ内容をJSONで返す。将来のRPAランナーが消費する用途。
- レスポンス例:

```json
{
  "ok": true,
  "month": "2026-06",
  "store": "全力ストレッチ岐阜長良店",
  "staff": [
    {
      "name": "多和田 雄仁",
      "name_kana": "タワダ ユウジン",
      "work_status": "active",
      "work_status_label": "在籍中",
      "employment_type_label": "アルバイト",
      "phone": "090-0000-0000",
      "monthly_hours": 82.5,
      "worked_days": 14,
      "late_absence": "無",
      "note": ""
    }
  ]
}
```

## Step 2（保留中・FC本部の許可が前提）

本部にAPI/CSV取込が無いため自動転記はRPA一択。**Vercelでは動かない**ため、別ランナー
（ローカルPC / VPS / GitHub Actions の月次cron 等）で実行する。

1. コネクタ抽象 `src/lib/fc-hq/index.ts`（`src/lib/salonboard/` の Noop パターン踏襲・未実装）
2. スタンドアロンRPA `tools/fc-hq-sync/`（Node + Playwright）
   - `/api/export/fc-hq` から月次JSON取得 → 本部ログイン → 各フォームへ自動入力。
   - 認証情報（本部ID/PW、`CRON_SECRET`）は**ランナー側のSecret**に置く（Vercelアプリには置かない）。

### 前提・リスク（オーナー側の対応）

- **FC本部の許可を取得**してから Step 2 を実装・実行する（規約 / 2段階認証 / 画面変更で停止しうる）。
- チャットに露出した本部のパスワードは**変更する**。
- Step 1 は本部の協力不要で即運用可（手入力の高速化が当面の実利）。

## 関連環境変数

| 変数 | 用途 |
|---|---|
| `CRON_SECRET` | `/api/export/fc-hq` の認証（既存のcronと共用） |
| `STORE_NAME` | 店舗名（未設定なら「全力ストレッチ岐阜長良店」） |
