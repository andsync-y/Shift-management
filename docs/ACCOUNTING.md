# 経理システム（売上・販管費・人件費／確定申告・決算）

シフト管理システム(Supabase + Next.js)に、領収書・カード明細・EC注文を取り込み、
人件費と合算して月次P&Lを出すための基盤。電子帳簿保存法に配慮し変更履歴を監査ログに残す。

## 構成（マイグレーション）

| ファイル | 内容 |
|---|---|
| `0020_accounting.sql` | `receipts` / `ec_orders` / `card_transactions` ＋ `audit_logs`＋監査トリガー＋RLS（オーナーのみ） |
| `0021_receipt_matching.sql` | 領収書⇔カード明細の自動マッチング（日付±3日・金額一致） |
| `0022_accounting_views.sql` | 人件費ビュー・経費ビュー・月次P&Lビュー |
| `supabase/functions/receipt-ocr/` | 領収書まとめ撮り画像→Geminiで複数領収書を一括抽出するEdge Function |

## 1. テーブルと監査ログ

- 財務3テーブルは **RLSでオーナー(is_super_admin)のみ**閲覧・編集可。
- 変更は `audit_trigger()`（SECURITY DEFINER）が INSERT/UPDATE/DELETE を `audit_logs` に自動記録。
  - `audit_logs` は **閲覧のみ**（UPDATE/DELETE ポリシー無し＝追記専用＝改ざん防止）。
  - `changed_by` は `auth.uid()`（サービスロール経由は NULL）。

## 2. 領収書OCR（Edge Function `receipt-ocr`）

- 入力: `{ path, bucket="receipts", insert? }`（Storageの画像パス）。
- 処理: Storageから画像取得 → **Gemini 1.5 Flash** にマルチモーダル要求（`responseMimeType: application/json`・temperature 0）→
  各領収書を `{date, amount, merchant}` で配列返却。`insert:true` で `receipts` に `status='pending'` 登録。
- 必要 secrets: `GEMINI_API_KEY`（`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` は自動）。
- デプロイ: `supabase functions deploy receipt-ocr` ／ `supabase secrets set GEMINI_API_KEY=...`
- ※ 本アプリ本体は Claude(Anthropic) を使用。本機能のみ要望によりGeminiを使用（OpenAIにも差し替え可）。

## 3. 自動マッチング

- 領収書に detected_date/amount が入った時、未紐付けのカード明細を **日付±3日・金額一致** で探し、最も近い1件に紐付け。
- カード明細INSERT時も、未紐付けの領収書を同条件で探して `receipt_id` をセット。二重紐付けは防止。

## 4. 人件費連動・月次P&L（ビュー）

- 仕様の `staff(時給)` = `profiles.hourly_wage`、勤務 = **実打刻 `time_records`**（＝実績人件費）。
- `v_labor_cost_staff_daily` / `v_labor_cost_daily` / `v_labor_cost_monthly`：実打刻×時給の集計。
- `v_expense_monthly`：カード明細の月次合計（販管費の元）。
- `v_pl_monthly`：月キーで 売上(仮0)・販管費・人件費・営業利益を合算。
  - **売上テーブルは本仕様未定義**のため `sales=0` を仮置き（売上連携時に差し替え）。
- ⚠️ ビューの人件費は**簡易**（休憩控除・残業/深夜割増・期間別時給は未反映）。正確な支給額は
  `/admin/payroll`（`src/lib/payroll.ts`）。決算用に厳密値が要る場合はpayrollロジックの集計を別途用意する。

## 未実装・今後

- 管理画面UI（領収書アップロード/確認・カード明細CSV取込・EC注文取込・P&Lダッシュボード）。
- 売上テーブルと連携（POS/予約実績など）。
- 勘定科目マスタと確定申告(青色決算書)向け帳票出力。
