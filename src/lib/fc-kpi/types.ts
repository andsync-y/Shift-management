// 本部KPIスナップショットのデータ形。取得ランナー・保存API・kiosk表示・手入力で共有する。
export interface FcKpiData {
  asOf?: string; // 取得日 "YYYY-MM-DD"
  yesterday?: {
    date?: string; // 対象日 "YYYY-MM-DD"
    newSales?: { staff: string; ticket?: number | null }[]; // 新規販売（回数券の回数 ticket）
    // 更新販売（ラスト1枚／途中更新など、新規以外の回数券販売）。
    // 給与の回数券バックは「新規＋更新」なので、新規と分けて持つ。
    renewals?: { staff: string; ticket?: number | null }[];
    nominations?: { staff: string; count?: number | null }[]; // 指名獲得
  };
  month?: {
    month?: string; // "YYYY-MM"
    sales?: number; // 売上（円）
    treatmentSales?: number; // 施術売上
    couponSales?: number; // 回数券売上
    designationSales?: number; // 指名売上
    newCount?: number; // 新規販売数
    newRate?: number; // 新規販売率 0-1
    nominationCount?: number; // 指名数
    nominationRate?: number; // 指名率 0-1
    staffNominations?: { name: string; count: number }[]; // 担当別の指名数（給与の指名本数 取込用）
    renewalCount?: number; // 更新販売数（店舗合計）
    // 担当別の回数券販売数（給与の回数券本数 取込用）。回数券バックは 新規＋更新 の合計。
    // renewalCount が null＝本部の表に更新販売数の列が見つからなかった（新規だけで取り込むと不足する）。
    staffTicketSales?: { name: string; newCount: number; renewalCount: number | null }[];
  };
}

// "AINA,10" 形式の行配列 → {staff, ticket}[]（手入力フォーム用パーサ）
export function parseStaffLines(text: string): { staff: string; ticket?: number | null }[] {
  return (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [staff, num] = l.split(/[,，\t]/).map((x) => x.trim());
      const n = Number(num);
      return { staff: staff || l, ticket: Number.isFinite(n) ? n : null };
    });
}

// "AINA,3" 形式の行配列 → {name, count}[]（担当別 指名数の手入力用）
export function parseNameCountLines(text: string): { name: string; count: number }[] {
  return (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, num] = l.split(/[,，\t]/).map((x) => x.trim());
      return { name, count: Math.max(0, Math.round(Number(num)) || 0) };
    })
    .filter((x) => x.name);
}

// "AINA,5,2"（名前,新規販売数,更新販売数）→ 担当別の回数券販売数。
// 3つ目を省いた "AINA,5" は更新が不明なので renewalCount=null（取込側で警告を出す）。
export function parseTicketSaleLines(
  text: string
): { name: string; newCount: number; renewalCount: number | null }[] {
  return (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, a, b] = l.split(/[,，\t]/).map((x) => x.trim());
      return {
        name,
        newCount: Math.max(0, Math.round(Number(a)) || 0),
        renewalCount: b === undefined || b === "" ? null : Math.max(0, Math.round(Number(b)) || 0),
      };
    })
    .filter((x) => x.name);
}
