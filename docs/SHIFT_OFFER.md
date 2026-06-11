# 出勤打診エンジン（休み承認 → 自動で代わりを探す）

休み希望の承認で**早番/遅番が無人(0名)になった枠**を、他スタッフへ LINE で1人ずつ
打診して埋める仕組み。実体は `src/lib/offers/engine.ts`。

## 早番 / 遅番の定義

- **早番** … 開始時刻が 12:00 より前
- **遅番** … 開始時刻が 12:00 以降

（`ShiftCalendarView` の「早/遅」表示と同じ基準。`bandOf()`）

## 発火条件（startOfferForApprovedRequest）

承認時、`src/app/admin/requests/actions.ts` から呼ばれる。

1. **終日休み**の承認のみ対象（時間変更・部分休みは人員から外れないので対象外）。
2. 承認時に**本人のその日のシフトを削除**し、その削除した時間（vacatedShifts）を engine に渡す。
3. engine は、本人が抜けた結果 **その枠（早番/遅番）が 0 名になった場合のみ**、
   その枠を埋める打診を開始する（＝**早番・遅番それぞれ最低1名**を確保する方針）。
   - まだ誰か割り当てがある枠は欠員なしとして打診しない。
   - 打診する時間は、本人が入っていたその枠のシフト時間をそのまま使う。

> 必要人数（`shift_requirements`）の設定有無に依存しない。割り当て実績ベースで判定する。

## 候補の選び方・打診の流れ

- 候補条件：LINE連携済み / 申請者本人でない / その日に承認済み休みでない /
  その日まだシフトが無い / `availability_preferences` でその枠の時間に勤務可能。
- 公平性：これまで打診を受けた回数が少ない人を先に並べる（`fairnessOrder`）。
- 1人ずつ LINE で「入れます / むり」を打診。最初に承諾した人を**自動でシフトに反映**。
- 無返答は `OFFER_TIMEOUT_HOURS`（既定3時間）で次の人へ（Cron `offer-timeout`、`expireStaleOfferAsks`）。
- 候補が尽きた／いない場合はオーナー（super_admin）へ LINE 通知。

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `src/lib/offers/engine.ts` | 不足検知・打診作成・返答処理・タイムアウト |
| `src/app/admin/requests/actions.ts` | 承認時に本人シフト削除＋engine呼び出し |
| `src/app/api/line/webhook/route.ts` | 「入れます/むり」postback を engine へ橋渡し |
| `src/app/api/cron/offer-timeout/route.ts` | 無返答タイムアウトの定期処理 |

## 環境変数

| 変数 | 内容 |
|---|---|
| `OFFER_TIMEOUT_HOURS` | 無返答で次の人へ回すまでの時間（既定3） |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | これが無いと打診は何もしない（no-op） |
