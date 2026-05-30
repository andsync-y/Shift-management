# 全力ストレッチ岐阜長良店 シフト管理サービス

スタッフのプロフィール・希望シフトをもとに、AIが月次シフト表を自動作成し、スタッフが
お休み希望を申請できるシフト管理 Web アプリです。

## 主な機能

| 機能 | 説明 | 状態 |
| --- | --- | --- |
| スタッフ管理 | 管理者(super_admin)がプロフィール・希望シフトを登録 | ✅ |
| AIシフト自動作成 | 希望シフト・必要人数・お休み希望をもとに月次シフトを自動生成（制約ソルバー + Claude API 補助） | ✅ |
| 店舗ルール参照AI生成 | Vercel環境変数の営業/労務ルールをシステムプロンプトに埋め込み、Claudeが店舗ルール準拠でシフトを生成 | ✅ |
| シフト手動調整 | AI生成後に管理者が個別シフトを追加・時刻変更・削除 | ✅ |
| シフト公開・確認 | 確定したシフト表をスタッフが個別ログインで閲覧 | ✅ |
| お休み希望申請 | スタッフが終日／時間帯のお休みを申請、管理者が承認 | ✅ |
| サロンボード連携 | ホットペッパービューティーへ確定シフトを自動入力（Playwright/RPA） | ⚙️ 雛形実装（入力部の調整が必要） |

## 技術スタック

- **フロント / API**: Next.js 15 (App Router, TypeScript, React Server Components)
- **認証 / DB**: Supabase (Auth + PostgreSQL + Row Level Security)
- **スタイル**: Tailwind CSS
- **AIシフト生成**: TypeScript 製の制約ベース貪欲ソルバー + Claude API による講評・調整提案
- **デプロイ想定**: Vercel

## ロールと権限

- `super_admin`（管理者）: スタッフ登録、必要人数設定、シフト生成・公開・確定、休み希望承認
- `staff`（スタッフ）: 自分のシフト閲覧、希望シフト登録、お休み希望申請

権限は Supabase の Row Level Security で DB レベルでも強制しています。

## 店舗ルール参照のAIシフト生成

シフト期間の詳細画面には2つの生成ボタンがあります。

- **🤖 ソルバーで自動生成**: 制約ベースの貪欲ソルバー（APIキー不要・無料・即時）
- **🧠 Claudeで生成（店舗ルール参照）**: Vercel/.env.local に設定した店舗ルール
  （営業時間・ベッド数・シフト種別・時間帯別人数・社保閾値・繁忙期など）を
  システムプロンプトに埋め込み、スタッフの希望シフト・承認済みお休み希望と
  突き合わせて Claude がシフトを生成します。

店舗ルールは `.env.example` の `STORE_*` 環境変数で設定します。読み込みは
[`src/lib/store-rules.ts`](src/lib/store-rules.ts)、プロンプト組み立ては
[`src/lib/shift-prompt.ts`](src/lib/shift-prompt.ts)、生成本体は
[`src/lib/shift-generator/claude-generator.ts`](src/lib/shift-generator/claude-generator.ts)。

> システムプロンプトのテンプレートを自店仕様に差し替えたい場合は
> `buildSystemPrompt()` を編集してください（店舗ルールは引数 `rules` から展開済み）。
> 使用モデルは `ANTHROPIC_MODEL`（既定 `claude-sonnet-4-6`）で変更できます。

## デプロイ

実際に動く画面を確認するには Vercel + Supabase へのデプロイが手軽です。
手順は **[DEPLOY.md](DEPLOY.md)** にまとめています。

## セットアップ（ローカル開発）

### 1. 依存インストール

```bash
npm install
```

### 2. Supabase プロジェクト作成 & マイグレーション適用

[Supabase](https://app.supabase.com) でプロジェクトを作成し、SQL Editor で
`supabase/migrations/0001_init.sql` を実行します（テーブル・RLS・トリガーを作成）。

### 3. 環境変数

`.env.example` を `.env.local` にコピーして値を設定します。

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase の API 設定から
- `SUPABASE_SERVICE_ROLE_KEY`: スタッフアカウント作成に使用（サーバー専用・秘匿）
- `ANTHROPIC_API_KEY`: 任意。設定するとAIシフト生成時に Claude による講評が付きます

### 4. 最初の管理者アカウント作成

Supabase の Authentication → Users から手動でユーザーを1人作成し、SQL Editor で
ロールを `super_admin` に更新します。

```sql
update profiles set role = 'super_admin' where id = '<作成したユーザーのUUID>';
```

以降は管理画面の「スタッフ管理」から他スタッフを登録できます。

### 5. （任意）サンプルデータ投入

動作確認用に管理者1名・スタッフ3名・希望シフト・必要人数・翌月のシフト期間を作成できます。
`.env.local` に `SUPABASE_SERVICE_ROLE_KEY` を設定したうえで:

```bash
npm run seed
# ログイン例: admin@example.com / password123
```

### 6. 開発サーバー起動

```bash
npm run dev
# http://localhost:3000
```

## 使い方の流れ

1. 管理者がスタッフを登録し、各スタッフの希望シフト（週次の勤務可能時間帯）を入力
2. スタッフは自分のアカウントで希望シフトの追加・お休み希望の申請が可能
3. 管理者が対象月の「シフト期間」を作成 → 曜日ごとの必要人数を設定
4. 「AIでシフトを自動生成」を実行 → ソルバーが割当、Claude が講評
5. 内容を確認して「スタッフに公開」 → スタッフが各自のシフトを閲覧
6. 問題なければ「シフトを確定」

## ディレクトリ構成

```
src/
├── app/
│   ├── login/                ログイン
│   ├── admin/                管理者画面（スタッフ・シフト・休み希望）
│   ├── staff/                スタッフ画面（シフト確認・希望シフト・お休み）
│   └── auth/actions.ts       ログアウト
├── components/               共通UI（NavBar / ShiftCalendar / AvailabilityEditor）
├── lib/
│   ├── supabase/             Supabase クライアント（ブラウザ/サーバー/管理）
│   ├── shift-generator/      シフト生成エンジン（solver + LLM 補助）
│   ├── salonboard/           サロンボード連携 抽象IF（将来用）
│   ├── auth.ts               ロールガード
│   └── types.ts              ドメイン型
└── middleware.ts             セッション更新・未ログインリダイレクト
supabase/migrations/          DBスキーマ + RLS
```

## サロンボード連携について

ホットペッパービューティーのサロンボードには公開 API が無いため、自動入力は
ブラウザ自動操作（RPA / Playwright）で行います。本リポジトリには
`src/lib/salonboard/` に抽象インターフェースと Playwright クライアントの雛形を実装しています。

### 有効化手順

1. Playwright とブラウザをインストール

   ```bash
   npm install playwright
   npx playwright install chromium
   ```

2. `.env.local` に自店舗の認証情報を設定

   ```
   SALONBOARD_LOGIN_ID=...
   SALONBOARD_PASSWORD=...
   ```

3. 管理画面でシフトを「確定」すると、期間詳細に「サロンボードへ反映」ボタンが表示されます。

### 注意事項

- **自店舗の正規アカウントでのみ利用してください。**
- ログイン処理までは実装済みですが、**シフト入力部分（`PlaywrightSalonBoardClient.inputOneShift`）は
  サロンボードの実画面に合わせた実装・検証が必要**です（DOM が非公開のため）。
- サロンボードの利用規約・**2段階認証(SMS/メール)**・画面変更の影響を受けます。2段階認証が
  有効な場合は自動ログインできないため、運用方針の検討が必要です。
- セレクタは環境変数（`SALONBOARD_SEL_*`）で上書きできます。
