# 入口スマートロック連携（セサミ + 公式LINE）

店舗入口の鍵（CANDY HOUSE「セサミ」）を、公式LINEから施錠/解錠できる仕組みのメモ。
コードは実装済み。本番で使うには **環境変数の設定** と **LINE側のリッチメニュー設定** が必要。

## 全体像

```
公式LINEのリッチメニュー（🔓解錠 / 🔒施錠）
   │  LIFFリンク https://liff.line.me/{LIFF_ID}/liff/lock?action=unlock|lock
   ▼
LIFF画面 /liff/lock        … idToken と現在地(GPS)を取得
   │  POST { idToken, action, lat, lng }
   ▼
/api/lock/control          … 本人確認・権限/ジオフェンス判定
   │
   ▼
src/lib/sesame.ts          … セサミ Web API に署名付きコマンド送信
   ▼
セサミ本体（Wi-Fiモジュール2 / Hub3 経由）
```

テキスト操作も可能：トークに「解錠」「施錠」等を送ると Webhook が処理する
（オーナーは直接実行、一般スタッフはジオフェンス判定のためメニューのボタンへ誘導）。

## 権限モデル

- 操作できるのは **LINE連携済みのスタッフのみ**（`profiles.line_user_id` で照合）。
- **オーナー（`role = super_admin`）**：場所の制限なし、どこからでも操作可。
- **一般スタッフ**：店舗周辺（ジオフェンス）でのみ操作可。判定はサーバー側
  `/api/lock/control` で `lib/geo` の `storeGeofence()` と距離比較。

## 必要な環境変数

セサミ（`src/lib/sesame.ts` 参照。未設定なら静かに無効＝既存機能は壊れない）:

| 変数 | 内容 |
|---|---|
| `SESAME_API_KEY` | CANDY HOUSE で発行する Web API キー（アカウント共通・1つ） |
| `SESAME_DEVICE_UUID` | セサミのデバイスUUID |
| `SESAME_SECRET_KEY` | デバイスの secret key（16バイト=32桁の16進） |

鍵が複数（1ドアに錠が2つ等）の場合は連番で追加できる（API キーは共通の1つ）:
`SESAME_DEVICE_UUID_1` / `SESAME_SECRET_KEY_1` … `_8` まで。施錠/解錠は全台へまとめて送信。

LIFF / ジオフェンス（他機能と共用）:

| 変数 | 内容 |
|---|---|
| `NEXT_PUBLIC_LIFF_ID` | LIFFアプリのID（打刻と共用。エンドポイントURLはサイトのルート） |
| 店舗ジオフェンス | `lib/geo` の設定（緯度・経度・半径）。一般スタッフの距離判定に使用 |

> 前提：セサミ5/6に Wi-Fiモジュール2 / Hub3 をペアリングし、アプリの
> 「設定 → 連携 → API」を ON にしておくこと（Bluetooth単体ではクラウド操作不可）。

## セサミ Web API の要点（`src/lib/sesame.ts`）

- エンドポイント：`https://app.candyhouse.co/api/sesame2/{uuid}/cmd`（POST）、状態は同URLの GET。
- ヘッダ：`x-api-key: {SESAME_API_KEY}`
- コマンド番号（SesameOS3）：**施錠 = 82 / 解錠 = 83**
- `history`：操作者名を base64 にしたもの（アプリの操作履歴に「誰が」を残す）。
- `sign`：**AES-CMAC（RFC 4493 / AES-128）** の署名。Unix秒(LE4バイト)の上位3バイトを
  secret key で CMAC した値。Node に CMAC が無いため自前実装している。

## LINE側の設定（リッチメニュー）

ボタンに設定するURL（`{LIFF_ID}` を実IDに置換）:

| ボタン | URL |
|---|---|
| 🔓 解錠 | `https://liff.line.me/{LIFF_ID}/liff/lock?action=unlock` |
| 🔒 施錠 | `https://liff.line.me/{LIFF_ID}/liff/lock?action=lock` |

> 必ず `liff.line.me/...` 形式で。直に `https://本番ドメイン/liff/lock` を貼ると
> idToken が取れず認証エラーになる。

手順（LINE公式アカウントマネージャー manager.line.biz）:
1. 対象アカウント →「トークルーム管理」→「リッチメニュー」→「作成」
2. 表示設定（タイトル・期間・メニューバーのテキスト）
3. テンプレート選択 → 各エリアのアクションを **タイプ「リンク」** にして上記URLを設定
4. 背景画像を作成 → 保存 → 公開

`{LIFF_ID}` の確認：LINE Developers → プロバイダー → **LINEログインチャネル** →
「LIFF」タブの LIFF ID（`NEXT_PUBLIC_LIFF_ID` と同値）。

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `src/lib/sesame.ts` | セサミ Web API ラッパ（署名・施錠/解錠/状態取得） |
| `src/app/api/lock/control/route.ts` | LIFFからの操作API（本人確認・権限/ジオフェンス判定） |
| `src/app/liff/lock/page.tsx` | LINE内で開く操作画面（`?action=` で自動実行） |
| `src/app/api/line/webhook/route.ts` | テキスト「解錠/施錠」等のキーワード処理 |
