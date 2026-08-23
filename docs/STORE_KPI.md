# 店舗KPI（本部システム連携・kiosk表示）

本部システム(zn-stretch)に表示される実績を1日1回取得し、受付タブレット（kiosk）に表示する。

## 表示する内容（kiosk下部「店舗実績」）
- **当月**：売上 / 新規販売数 / 更新販売数 / 新規販売率 / 指名数 / 指名率
- **昨日**：新規販売したスタッフ（回数券の回数つき）／ **更新販売したスタッフ**（あるときだけ表示）／ 指名を獲得したスタッフ

## 構成（取得→保存→表示）
1. **取得（別ランナー）**：`tools/fc-kpi-sync`（Playwright）が本部にログイン→数値を読み取り→
   `POST /api/kpi/ingest`（`KPI_INGEST_SECRET` で認証）。**Vercel不可**。GitHub Actions（
   `.github/workflows/fc-kpi-sync.yml`）/ ローカル / VPS で実行。
   - **起動（定期実行）**：GitHub の `schedule` は遅延・スキップが多く不安定なので、**主トリガは
     Vercel Cron**（`/api/cron/kpi-sync`・`vercel.json`・07:30 JST）。これが GitHub の
     `workflow_dispatch` を叩いてスクレイパを確実に起動する。要 `GITHUB_DISPATCH_TOKEN`（PAT・
     対象リポジトリの Actions:write）。ワークフロー側の `schedule`（07:00/13:00/19:00 JST）は
     **バックアップ＋日中の当月売上の再取得**用（ingestは取得日キーで冪等＝上書き）。
2. **保存**：`fc_kpi` テーブル（migration 0032・JSONスナップショット・オーナーのみRLS）。
3. **表示**：kioskが `GET /api/kiosk/kpi`（KIOSK_TOKEN保護）で最新を読み、`KpiPanel` で表示。
4. **手入力フォールバック**：管理画面「運営 > 店舗KPI」（`/admin/kpi`）で手入力すればkioskに反映
   （同じ取得日は上書き）。自動取得が未整備/失敗のときに使う。

## データ形（`src/lib/fc-kpi/types.ts` の `FcKpiData`）
```json
{
  "asOf": "2026-06-28",
  "month": { "month": "2026-06", "sales": 1234567, "newCount": 42, "newRate": 0.28,
             "nominationCount": 30, "nominationRate": 0.2, "renewalCount": 6,
             "staffNominations": [ { "name": "AINA", "count": 12 } ],
             "staffTicketSales": [ { "name": "AINA", "newCount": 5, "renewalCount": 2 } ] },
  "yesterday": { "date": "2026-06-27",
    "newSales": [ { "staff": "AINA", "ticket": 10 } ],
    "renewals": [ { "staff": "KAYO", "ticket": 3 } ],
    "nominations": [ { "staff": "AINA", "count": 3 } ] }
}
```
率（newRate / nominationRate）は 0〜1。手入力フォームは % で入力し内部で /100。

`newSales` は**新規**の回数券販売、`renewals` は**それ以外＝更新**（ラスト1枚／途中更新など）。
給与の**回数券バックは「新規＋更新」**なので分けて持つ（以前は新規しか拾わず更新が落ちていた）。
ダッシュボードの担当別表にフォールバックしたときは更新を取れないため `renewals` は空になる。

## 前提・運用
- 本部の**自動アクセス許可が前提**（取得済み）。2段階認証・画面変更で停止しうる運用。
- 本部のログインID/PWは**ランナー側のSecret**にのみ置く（アプリ・リポジトリ・チャットに書かない・定期変更）。
- `tools/fc-kpi-sync/sync.mjs` の `extractMonth` / `extractYesterday` は**実画面に合わせてセレクタを確定**する
  （未確定の間は手入力で運用）。

## 給与への取込
スナップショットの **`month.staffNominations`（担当別 指名数）** と
**`month.staffTicketSales`（担当別 新規販売数・更新販売数）** は、給与画面の
**「FC実績を取込んで給与確定」** が読む値。指名本数（`nomination_counts`）と
回数券本数（`kaisuken_counts` ＝ **新規＋更新**）に一括で入る（`docs/PAYROLL.md` 参照）。

- 担当名は本部の表記のまま入るので、スタッフの **表示名（`display_name`）を本部に合わせる**。
  一致しない担当は取り込まず、給与画面のメッセージに名前と本数を出す。
- 本部の担当別表から**「更新販売数」の列が取れなかった場合**は `renewalCount: null` で保存され、
  取込時に⚠️警告が出る。その月は「来店記録CSVの取込」で本数を入れ直す。
- **自動取得が失敗したときは `/admin/kpi` の「担当別 回数券販売数 / 担当別 指名数」に手入力**すれば
  同じボタンで取り込める（1行「名前,新規,更新」／「名前,件数」）。

### ボタンから今すぐ取得する
保存済みスナップショットに回数券販売数が無い場合、「FC実績を取込んで給与確定」は
**その場で本部スクレイパを起動して取得を待つ**（`requestFcSync` → `dispatchKpiSync` →
GitHub の `workflow_dispatch`）。6秒おきに `fcSnapshotState` を見て、対象月の
スナップショットの `updated_at` が動いたら取り込み直す（最大3分で打ち切り）。

アプリ（Vercel）からは本部システムへ直接アクセスできない（Chromiumが動かない・
本部の資格情報はランナー側の Secret にしか置かない）ため、**「起動して待つ」形になる**のは
仕様。日次取得を待たずに当月の数字を締められる。

起動には `GITHUB_DISPATCH_TOKEN` が必要。既定の起動対象は `main`
（`GITHUB_DISPATCH_REF` で変更可）。**以前は作業ブランチ名が既定だった**ため、
ブランチを消すと黙って起動できなくなる状態だった。

## 関連
| ファイル | 役割 |
|---|---|
| `supabase/migrations/0032_fc_kpi.sql` | KPIスナップショット表 |
| `src/app/api/kpi/ingest/route.ts` | 取り込みAPI（ランナー→保存） |
| `src/app/api/kiosk/kpi/route.ts` | kiosk向け最新取得 |
| `src/app/kiosk/KpiPanel.tsx` | kiosk表示 |
| `src/app/admin/kpi/` | 手入力フォールバック |
| `tools/fc-kpi-sync/` | 取得ランナー（Playwright）＋GitHub Actions |
