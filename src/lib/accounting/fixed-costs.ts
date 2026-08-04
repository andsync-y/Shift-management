// 固定費（毎月の定額費用）の型と、指定月での集計ヘルパー。
export interface FixedCost {
  id: string;
  name: string;
  amount: number;
  category: string | null;
  pl_expense: boolean; // false=借入返済等（経常利益から除外）
  start_month: string | null; // "YYYY-MM" 以上で有効
  end_month: string | null; // "YYYY-MM" 以下で有効
  note: string | null;
  sort_order: number;
}

// その月に適用される固定費か（start_month〜end_month の範囲）。
export function isActiveFixedCost(fc: Pick<FixedCost, "start_month" | "end_month">, month: string): boolean {
  if (fc.start_month && month < fc.start_month) return false;
  if (fc.end_month && month > fc.end_month) return false;
  return true;
}

// 指定月の固定費合計を「経費（P&L）」と「借入返済（非経費）」に分けて返す。
export function sumFixedCosts(costs: FixedCost[], month: string): { expense: number; repayment: number } {
  let expense = 0;
  let repayment = 0;
  for (const c of costs) {
    if (!isActiveFixedCost(c, month)) continue;
    if (c.pl_expense) expense += Number(c.amount);
    else repayment += Number(c.amount);
  }
  return { expense, repayment };
}
