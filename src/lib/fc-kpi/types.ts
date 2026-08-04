// 本部KPIスナップショットのデータ形。取得ランナー・保存API・kiosk表示・手入力で共有する。
export interface FcKpiData {
  asOf?: string; // 取得日 "YYYY-MM-DD"
  yesterday?: {
    date?: string; // 対象日 "YYYY-MM-DD"
    newSales?: { staff: string; ticket?: number | null }[]; // 新規販売（回数券の回数 ticket）
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
