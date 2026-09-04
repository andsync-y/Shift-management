// 社会保険の「その月に保険料が発生するか」の判定。
//
// 保険料は月末時点で被保険者資格がある月に発生する（実務）:
//   資格取得日の属する月 〜 資格喪失日の属する月の「前月」まで。
//   喪失日は退職日の翌日なので、10/31退職＝喪失日11/1 なら10月分まで発生する。
//
// 日付を入れていないスタッフは、従来どおり shaho_enrolled のフラグで判定する
// （フラグは月の区別が無いため、加入・脱退のたびに手で切り替える必要がある）。

export interface ShahoPeriod {
  /** 資格取得日 "YYYY-MM-DD"。未設定なら null */
  enrolledOn?: string | null;
  /** 資格喪失日 "YYYY-MM-DD"（退職日の翌日）。継続中なら null */
  leftOn?: string | null;
  /** 旧フラグ。日付が未設定のときのフォールバック */
  enrolledFlag?: boolean | null;
}

/** その月の末日 "YYYY-MM-DD"。month は "YYYY-MM"。 */
export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

/**
 * 対象月（"YYYY-MM"）に社会保険料が発生するか。
 * 日付は文字列のまま比較する（"YYYY-MM-DD" は辞書順＝時系列順）。
 */
export function shahoAppliesTo(month: string, p: ShahoPeriod): boolean {
  const enrolledOn = p.enrolledOn?.slice(0, 10) || null;
  const leftOn = p.leftOn?.slice(0, 10) || null;

  // 日付が1つも入っていなければ旧フラグで判定（後方互換）
  if (!enrolledOn && !leftOn) return !!p.enrolledFlag;

  const end = monthEnd(month);
  // 取得日が月末より後＝まだ加入していない月
  if (enrolledOn && enrolledOn > end) return false;
  // 取得日が未設定で喪失日だけある場合は、喪失前は加入していたとみなす
  // 喪失日が月末以前＝その月の末日時点で資格が無い → 保険料は発生しない
  if (leftOn && leftOn <= end) return false;
  return true;
}

/** 画面表示用のラベル。 */
export function shahoStatusLabel(month: string, p: ShahoPeriod): string {
  if (shahoAppliesTo(month, p)) return "加入中";
  if (p.enrolledOn && p.enrolledOn.slice(0, 10) > monthEnd(month)) {
    const [y, m] = p.enrolledOn.slice(0, 7).split("-");
    return `${Number(m)}月から加入`;
  }
  if (p.leftOn && p.leftOn.slice(0, 10) <= monthEnd(month)) return "資格喪失";
  return "未加入";
}
