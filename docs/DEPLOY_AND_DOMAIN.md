# 本番公開（独自ドメイン）手順

このアプリは Next.js + Supabase 構成です。一般的には **Vercel** にデプロイし、
独自ドメインを割り当てます。LINE 連携を使うには、この本番ドメインが必須です。

---

## 全体の流れ

```
1. Supabase プロジェクト（本番DB）を用意
2. GitHub リポジトリを Vercel に接続してデプロイ
3. 環境変数を Vercel に設定
4. 独自ドメインを取得して Vercel に追加（DNS設定）
5. （任意）LINE 連携のキーを設定
```

---

## 1. Supabase（本番DB）

- https://app.supabase.com で本番用プロジェクトを作成（無料枠でOK）
- SQL Editor で `supabase/migrations/` の SQL を**番号順に全部**実行
  （0001 → 0007。`0007_line_user_id.sql` まで）
- Project Settings → API から以下を控える
  - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
  - `anon public` キー → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `service_role` キー → `SUPABASE_SERVICE_ROLE_KEY`（**秘密**）

## 2. Vercel にデプロイ

1. https://vercel.com にログイン（GitHubアカウントでOK）
2. 「Add New… → Project」→ このリポジトリを Import
3. Framework は自動で Next.js が選ばれる。そのまま Deploy
4. 初回は環境変数未設定で失敗してもOK（次で設定）

## 3. 環境変数（Vercel → Project → Settings → Environment Variables）

`.env.example` を見ながら設定。最低限これが必要：

| 変数 | 値 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase の Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon キー |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role キー（秘密） |
| `NEXT_PUBLIC_APP_URL` | 本番URL（例 `https://shift.example.com`） |

設定したら「Redeploy」。

## 4. 独自ドメインを追加

### ドメインを持っていない場合
- お名前.com / Cloudflare / Google Domains などで取得（年1,000〜2,000円程度）

### Vercel にドメインを追加
1. Vercel → Project → Settings → Domains
2. 使いたいドメインを入力
   - 例1：サブドメイン `shift.example.com`（おすすめ・既存サイトと共存できる）
   - 例2：ルート `example.com`
3. Vercel が表示する DNS レコードを、ドメインの管理画面で設定：
   - **サブドメイン**の場合 → `CNAME` レコード
     `shift` → `cname.vercel-dns.com`
   - **ルートドメイン**の場合 → `A` レコード（Vercel 指定のIP）
4. 反映まで数分〜最大48時間。Vercel の Domains 画面が「Valid」になれば完了
5. HTTPS 証明書は Vercel が自動発行（追加作業なし）

### ドメイン確定後にやること
- `NEXT_PUBLIC_APP_URL` を確定したドメインに更新して Redeploy

---

## 5. （任意）LINE 連携を有効化

`docs/LINE_INTEGRATION.md` の手順で LINE チャネルを作成し、
以下を Vercel の環境変数に追加：

```
NEXT_PUBLIC_LINE_LOGIN=1
LINE_LOGIN_CHANNEL_ID=...
LINE_LOGIN_CHANNEL_SECRET=...
LINE_LOGIN_REDIRECT_URI=https://<本番ドメイン>/auth/line/callback
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=...
```

LINE Developers 側の Callback URL にも
`https://<本番ドメイン>/auth/line/callback` を登録する。

---

## よくある質問

**Q. 既存の店舗サイトがあるドメインでも使える？**
A. はい。`shift.お店のドメイン` のようなサブドメインにすれば、本体サイトと
別に共存できます（CNAMEを1つ足すだけ）。

**Q. 月いくらかかる？**
A. Vercel 無料枠 + Supabase 無料枠で、この規模なら基本0円。ドメイン代のみ。
   アクセスやデータが増えたら有料プランを検討。

**Q. デプロイし直すには？**
A. GitHub の本番ブランチに push すれば Vercel が自動で再デプロイします。
