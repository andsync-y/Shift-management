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
| `NEXT_PUBLIC_APP_URL` | `https://shift.andsync.jp` |

設定したら「Redeploy」。

## 4. 独自ドメインを追加（`shift.andsync.jp`）

会社ドメイン **andsync.jp** をすでに保有しているので、その**サブドメイン
`shift.andsync.jp`** を使う。本体サイトとは完全に独立して動くため、
今後 andsync.jp 本体を作っても干渉しない。

### Vercel にドメインを追加
1. Vercel → Project → Settings → Domains
2. `shift.andsync.jp` を入力して Add
3. Vercel が表示する DNS レコードを、andsync.jp の DNS 管理画面で設定：
   - **CNAME** レコードを1つ追加
     ホスト名 `shift` → 値 `cname.vercel-dns.com`
   - （andsync.jp を Cloudflare で管理している場合は、この CNAME の
     プロキシを「DNS only / グレー雲」にしておくと確実）
4. 反映まで数分〜最大48時間。Vercel の Domains 画面が「Valid」になれば完了
5. HTTPS 証明書は Vercel が自動発行（追加作業なし）

> andsync.jp の DNS がどこで管理されているか（取得したレジストラ or Cloudflare 等）が
> わかれば、その画面での具体的な追加手順も案内できます。

---

## 5. （任意）LINE 連携を有効化

`docs/LINE_INTEGRATION.md` の手順で LINE チャネルを作成し、
以下を Vercel の環境変数に追加：

```
NEXT_PUBLIC_LINE_LOGIN=1
LINE_LOGIN_CHANNEL_ID=...
LINE_LOGIN_CHANNEL_SECRET=...
LINE_LOGIN_REDIRECT_URI=https://shift.andsync.jp/auth/line/callback
# 通知（既存の店舗公式アカウントを Messaging API 化して流用）
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=...
```

LINE Developers 側（LINE Login チャネル）の Callback URL にも
`https://shift.andsync.jp/auth/line/callback` を登録する。

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
