# 店舗KPI（本部システム連携・kiosk表示）

本部システム(zn-stretch)に表示される実績を1日1回取得し、受付タブレット（kiosk）に表示する。

## 表示する内容（kiosk下部「店舗実績」）
- **当月**：売上 / 新規販売数 / 新規販売率 / 指名数 / 指名率
- **昨日**：新規販売したスタッフ（回数券の回数つき）／ 指名を獲得したスタッフ

## 構成（取得→保存→表示）
1. **取得（別ランナー）**：`tools/fc-kpi-sync`（Playwright）が本部にログイン→数値を読み取り→
   `POST /api/kpi/ingest`（`KPI_INGEST_SECRET` で認証）。**Vercel不可**。GitHub Actions（日次cron・
   `.github/workflows/fc-kpi-sync.yml`）/ ローカル / VPS で実行。
2. **保存**：`fc_kpi` テーブル（migration 0032・JSONスナップショット・オーナーのみRLS）。
3. **表示**：kioskが `GET /api/kiosk/kpi`（KIOSK_TOKEN保護）で最新を読み、`KpiPanel` で表示。
4. **手入力フォールバック**：管理画面「運営 > 店舗KPI」（`/admin/kpi`）で手入力すればkioskに反映
   （同じ取得日は上書き）。自動取得が未整備/失敗のときに使う。

## データ形（`src/lib/fc-kpi/types.ts` の `FcKpiData`）
```json
{
  "asOf": "2026-06-28",
  "month": { "month": "2026-06", "sales": 1234567, "newCount": 42, "newRate": 0.28,
             "nominationCount": 30, "nominationRate": 0.2 },
  "yesterday": { "date": "2026-06-27",
    "newSales": [ { "staff": "AINA", "ticket": 10 } ],
    "nominations": [ { "staff": "AINA", "count": 3 } ] }
}
```
率（newRate / nominationRate）は 0〜1。手入力フォームは % で入力し内部で /100。

## 前提・運用
- 本部の**自動アクセス許可が前提**（取得済み）。2段階認証・画面変更で停止しうる運用。
- 本部のログインID/PWは**ランナー側のSecret**にのみ置く（アプリ・リポジトリ・チャットに書かない・定期変更）。
- `tools/fc-kpi-sync/sync.mjs` の `extractMonth` / `extractYesterday` は**実画面に合わせてセレクタを確定**する
  （未確定の間は手入力で運用）。

## 関連
| ファイル | 役割 |
|---|---|
| `supabase/migrations/0032_fc_kpi.sql` | KPIスナップショット表 |
| `src/app/api/kpi/ingest/route.ts` | 取り込みAPI（ランナー→保存） |
| `src/app/api/kiosk/kpi/route.ts` | kiosk向け最新取得 |
| `src/app/kiosk/KpiPanel.tsx` | kiosk表示 |
| `src/app/admin/kpi/` | 手入力フォールバック |
| `tools/fc-kpi-sync/` | 取得ランナー（Playwright）＋GitHub Actions |
