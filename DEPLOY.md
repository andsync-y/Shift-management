# デプロイ手順（Vercel + Supabase）

実際に動く管理画面を確認するための、本番デプロイ手順です。所要時間はおよそ 20〜30 分です。

---

## 全体の流れ

```
Supabase 作成 → DBマイグレーション → 認証情報取得 → 初期管理者作成
        → Vercel にインポート → 環境変数設定 → デプロイ → 動作確認
```

---

## 1. Supabase プロジェクトを作成

1. https://supabase.com にサインイン（GitHubアカウントでOK）
2. 「New project」→ 組織を選択
3. 以下を入力して作成
   - **Name**: `zenryoku-shift`（任意）
   - **Database Password**: 強固なものを設定（控えておく）
   - **Region**: `Northeast Asia (Tokyo)` を推奨
4. 作成完了まで 1〜2 分待つ

## 2. データベースのマイグレーション適用

1. 左メニュー **SQL Editor** を開く
2. 「New query」を押す
3. リポジトリの [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) の中身を **全文コピー＆ペースト**
4. 右下の **Run** を押す（テーブル・RLS・トリガーが作成されます）
5. 左メニュー **Table Editor** で `profiles` `shifts` などのテーブルができていることを確認

## 3. 認証情報（APIキー）を取得

1. 左メニュー **Project Settings**（歯車）→ **API**
2. 以下の3つを控える
   - **Project URL** … `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key … `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key（"Reveal" を押す）… `SUPABASE_SERVICE_ROLE_KEY`
     - ⚠️ service_role は管理者権限。**絶対に公開しない**こと（Vercelのサーバー環境変数にのみ設定）

## 4. 最初の管理者アカウントを作成

> 最初の1人だけは手動で作成します。以降は画面の「スタッフ管理」から登録できます。

1. 左メニュー **Authentication** → **Users** → **Add user** → **Create new user**
   - Email / Password を入力（例: `you@example.com`）
   - **Auto Confirm User** にチェック（メール確認をスキップ）
2. 作成したユーザーの行をクリックして **User UID** をコピー
3. **SQL Editor** で次を実行（UID を貼り替え）

   ```sql
   update profiles set role = 'super_admin'
   where id = '<コピーしたUID>';
   ```

## 5. Vercel にインポート

1. https://vercel.com に GitHub アカウントでサインイン
2. **Add New...** → **Project**
3. `andsync-y/Shift-management` リポジトリを **Import**
   - ※ このPRをマージ後は `main` から、マージ前に試す場合はブランチ
     `claude/amazing-dijkstra-6D0dG` を選択
4. **Framework Preset** が `Next.js` になっていることを確認（自動検出されます）

## 6. 環境変数を設定

Import 画面の **Environment Variables** に以下を追加（Vercel管理画面の Settings → Environment Variables からでも可）:

| Key | Value | 備考 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | 手順3 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key | 手順3 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | 手順3・秘匿 |
| `ANTHROPIC_API_KEY` | sk-ant-... | 任意（AI講評を使う場合） |

## 7. デプロイ

**Deploy** を押す → 数分でビルド完了 → 発行された URL（`https://xxx.vercel.app`）を開く

## 8. 動作確認

1. 発行URLを開くと `/login` に飛びます
2. 手順4で作った管理者でログイン
3. **スタッフ管理** からスタッフを登録 → 各スタッフの希望シフトを入力
4. **シフト作成** で対象月の期間を作成 → 必要人数を設定
5. 「🤖 AIでシフトを自動生成」→ 「スタッフに公開」→ 「シフトを確定」
6. スタッフ用アカウントでログインすると、シフト確認・お休み希望申請ができます

---

## よくあるつまずき

- **ログイン後すぐ /login に戻る** … `profiles` に行が無い可能性。手順4のトリガーで自動作成されますが、
  手動作成ユーザーの場合は SQL Editor で `select * from profiles;` を確認してください。
- **「Invalid API key」** … 環境変数の貼り間違い。Vercel の Settings → Environment Variables を再確認し、
  変更後は **Redeploy** が必要です。
- **AI講評が出ない** … `ANTHROPIC_API_KEY` 未設定。設定しなくてもソルバーによるシフト生成は動作します。
- **スマホで確認したい** … Vercel の URL をそのままスマホのブラウザで開けばOK（レスポンシブ対応）。

---

## 補足: サロンボード連携について

サロンボードへの自動入力（Playwright/RPA）は、ブラウザを起動する都合上 Vercel の
サーバーレス環境では動作しません。常駐サーバー（VPS / Railway / 自社PC など）での
実行が必要です。導入時に別途ご相談ください。
