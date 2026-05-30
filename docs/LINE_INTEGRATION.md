# LINE連携 設計メモ（ログイン＋通知）

このドキュメントは「メールアドレスでのログインをやめて LINE ログインにする」
「シフト公開や休み希望の承認などを LINE で通知する」ための設計と、
オーナー側で必要な準備（LINE Developers の設定）をまとめたものです。

---

## 前提：今の認証の仕組み

- ログインは Supabase Auth の「メール＋パスワード」。
- **メールは送信には一切使っていない**（招待メールも確認スキップ）。
  ログインの識別子としてだけ使われている。
- スタッフのアカウントはオーナーが管理画面から発行（`admin.auth.admin.createUser`）。

→ よって「メールをやめて LINE に置き換える」ことに、通知面のデメリットはない。

---

## 全体像

LINE 連携は **2 つの別機能**。混同しないこと。

| 機能 | 何をする | LINE 側に必要なもの |
|---|---|---|
| **LINE ログイン** | パスワード不要で LINE アカウントでログイン | **LINE Login チャネル**（Channel ID / Channel Secret） |
| **LINE 通知** | 「シフト公開」「休み承認」等を LINE に送る | **Messaging API チャネル**（Channel access token） |

どちらも **本番の公開 URL（独自ドメイン）** が前提。
プレビュー環境では URL が変わるためテスト不可。

---

## A. LINE ログイン

### 方式

Supabase Auth は LINE を**標準サポートしていない**ため、自前で OAuth2(OIDC) を実装し、
取得した LINE ユーザーを Supabase のユーザーに結びつける。

```
[スタッフ] --(1)--> /auth/line               （ログインボタン）
   /auth/line --(2)--> LINEの認可画面へリダイレクト
   LINEで承認 --(3)--> /auth/line/callback?code=...&state=...
   callback --(4)--> LINEのtokenエンドポイントでcodeをID Tokenに交換
   ID Tokenを検証して line_user_id (sub) と表示名を取得
   --(5)--> profiles.line_user_id で既存スタッフを照合
   --(6)--> Supabase の admin API でそのユーザーとしてセッション発行
   --(7)--> / にリダイレクト（ログイン完了）
```

ポイント：
- **照合キーは `line_user_id`（LINEの `sub`）**。事前にオーナーが各スタッフの
  `line_user_id` を登録しておく必要がある（後述「初回ひも付け」）。
- LINE で初めて入った未登録ユーザーは弾く（勝手に登録させない）。

### 初回ひも付け（実装済みの方式）

スタッフがまだ `line_user_id` 未登録だと照合できない。本アプリでは
**「初回だけ既存のログインID＋パスワードで本人確認」方式**を実装済み：

1. スタッフが「LINEでログイン」を押す
2. 未連携なら `/link-line` 画面に誘導される
3. いまのログインID（メール）＋パスワードを1回だけ入力
4. 本人確認できたら、その LINE userId を自分の profile に保存
5. 以降はLINEだけでログインできる（パスワード入力は不要）

> 新規ドメイン取得や招待コードの配布が不要で、既存アカウントをそのまま
> 使えるため移行がスムーズ。将来「友だち追加Webhookで自動取得」に
> 切り替えることも可能。

### DB 変更

```sql
alter table profiles add column if not exists line_user_id text unique;
```

### 必要な環境変数

```
LINE_LOGIN_CHANNEL_ID=...
LINE_LOGIN_CHANNEL_SECRET=...
LINE_LOGIN_REDIRECT_URI=https://<本番ドメイン>/auth/line/callback
SUPABASE_SERVICE_ROLE_KEY=...   # セッション発行に必要（既存）
```

### オーナーが LINE Developers でやること

1. https://developers.line.biz/ でログイン（LINEアカウント）
2. プロバイダーを作成（店名でOK）
3. **「LINE Login」チャネル**を新規作成
4. Channel ID / Channel Secret を控える
5. Callback URL に `https://<本番ドメイン>/auth/line/callback` を登録
6. （任意）アプリ名・アイコンを設定

---

## B. LINE 通知（Messaging API）

### 何を通知するか（案）

| イベント | 宛先 | 文面例 |
|---|---|---|
| シフト公開 | 対象スタッフ全員 | 「◯月のシフトが公開されました。確認してください 👉 <URL>」 |
| 休み希望が承認/却下 | 申請者 | 「◯/◯ の休み希望が【承認】されました」 |
| 新しい休み希望 | オーナー | 「◯◯さんから休み希望が届きました」 |

### 方式

- LINE 公式アカウント（Messaging API チャネル）を作成し、**Channel access token** を取得。
- サーバー（Server Action / Route Handler）から LINE の push API を叩く：
  `POST https://api.line.me/v2/bot/message/push`
- 送信先は各スタッフの `line_user_id`（A で集めたものを再利用）。
- スタッフは**公式アカウントを友だち追加していること**が push の条件。

### 必要な環境変数

```
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=...
LINE_MESSAGING_CHANNEL_SECRET=...   # Webhook署名検証用（友だち追加でuserId取得する場合）
```

### オーナーが LINE Developers でやること

1. 同じプロバイダー内に **「Messaging API」チャネル**を作成
   （= LINE 公式アカウントが1つできる）
2. Channel access token（long-lived）を発行して控える
3. スタッフに公式アカウントを友だち追加してもらう
4. （初回ひも付けに使うなら）Webhook URL に
   `https://<本番ドメイン>/api/line/webhook` を登録

---

## 実装ステップ（コード側）

ログイン・通知それぞれ独立して進められる。**すべて env で ON/OFF** し、
キー未設定なら従来のメール＋パスワードのまま動くようにする（段階移行）。

### Phase 1: 下地（DB・設定）✅ 実装済み
- [x] `profiles.line_user_id` カラム追加（migration 0007）
- [x] `src/lib/line.ts`（LINE API ラッパ：token交換・id_token検証・push送信）

### Phase 2: LINE ログイン ✅ 実装済み（本番対応）
- [x] `GET /auth/line`（state/nonce発行 → LINE認可へリダイレクト）
- [x] `GET /auth/line/callback`（code交換・照合・Supabaseセッション発行）
- [x] id_token を LINE の `/oauth2/v2.1/verify` で検証（署名/exp/aud/nonce）
- [x] ログイン画面に「LINEでログイン」ボタン（`NEXT_PUBLIC_LINE_LOGIN=1`で表示）
- [x] `/link-line` 初回ひも付け画面（既存ID＋PWで本人確認）
- [ ] （任意）管理画面：スタッフ詳細に line_user_id 表示／解除

### Phase 3: LINE 通知 ✅ 主要分は実装済み
- [x] シフト公開時に対象スタッフへ push（`setPeriodStatus` published時）
- [x] 休み希望の承認/却下時に申請者へ push（`reviewRequest`）
- [ ] （任意）新規休み希望時にオーナーへ push
- [ ] （任意）友だち追加 Webhook で userId 自動取得

### Phase 4: メール撤去（任意・最後）
- [ ] スタッフ作成フォームからメール欄を任意化／自動採番に
- [ ] 既存ユーザーの移行（line_user_id を全員に登録してから切替）

> ✅ id_token の検証は LINE 公式の検証エンドポイント（`/oauth2/v2.1/verify`）で
> 署名・有効期限・aud(client_id一致)・nonce をサーバ側で確認済み。
> （`src/lib/line.ts` の `exchangeLineCode` 参照）

---

## オーナーへの「お願いリスト」（これが揃えば結線できる）

実装を本番で動かすために、以下を用意してください：

1. **本番ドメイン** `shift.andsync.jp`（andsync.jp のサブドメイン）と Vercel へのデプロイ
2. LINE Developers アカウント＋プロバイダー
3. **LINE Login チャネル**の Channel ID / Channel Secret
4. **Messaging API チャネル**の Channel access token
5. 上記キーを Vercel の環境変数に設定（値は私には渡さず、あなたが設定）

> セキュリティ上、Channel Secret / access token は**コードに直接書かず必ず環境変数**に。
> リポジトリには絶対にコミットしない。
