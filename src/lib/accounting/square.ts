// =====================================================================
// Square 売上取得（Orders API / SearchOrders）
// =====================================================================
// 指定月の「税抜・純売上（返金控除後）」を集計する。
//   税抜純売上 = net_amounts.total_money − tax − tip − service_charge
//   （net_amounts は返品・返金を反映した純額。無ければ total_* で代替）
// JPY は Money.amount が円そのもの（最小単位=1円）。
//
// 必要な環境変数:
//   SQUARE_ACCESS_TOKEN  … Square 開発者ダッシュボードのアクセストークン
//   SQUARE_LOCATION_ID   … 店舗の Location ID
//   SQUARE_ENV           … 'production'（既定）/ 'sandbox'
// =====================================================================

const SQUARE_VERSION = "2025-01-23";

type Money = { amount?: number; currency?: string } | undefined;
interface SquareOrder {
  total_money?: Money;
  total_tax_money?: Money;
  total_tip_money?: Money;
  total_service_charge_money?: Money;
  net_amounts?: {
    total_money?: Money;
    tax_money?: Money;
    tip_money?: Money;
    service_charge_money?: Money;
  };
}

function amt(m: Money): number {
  return typeof m?.amount === "number" ? m.amount : 0;
}

// 1注文の税抜純売上（返金控除後）
function netSales(o: SquareOrder): number {
  const na = o.net_amounts;
  const total = na ? amt(na.total_money) : amt(o.total_money);
  const tax = na ? amt(na.tax_money) : amt(o.total_tax_money);
  const tip = na ? amt(na.tip_money) : amt(o.total_tip_money);
  const svc = na ? amt(na.service_charge_money) : amt(o.total_service_charge_money);
  return total - tax - tip - svc;
}

export interface SquareSalesResult {
  ok: boolean;
  amount: number; // 税抜純売上（円）
  count: number; // 集計した注文数
  message?: string;
}

export async function fetchMonthlySquareSales(month: string): Promise<SquareSalesResult> {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  const location = process.env.SQUARE_LOCATION_ID;
  if (!token || !location) {
    return { ok: false, amount: 0, count: 0, message: "SQUARE_ACCESS_TOKEN / SQUARE_LOCATION_ID が未設定です。" };
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { ok: false, amount: 0, count: 0, message: "月の指定が不正です（YYYY-MM）。" };
  }
  const base =
    process.env.SQUARE_ENV === "sandbox"
      ? "https://connect.squareupsandbox.com"
      : "https://connect.squareup.com";

  const [y, m] = month.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const start_at = `${month}-01T00:00:00+09:00`;
  const end_at = `${ny}-${String(nm).padStart(2, "0")}-01T00:00:00+09:00`;

  let cursor: string | undefined;
  let total = 0;
  let count = 0;
  try {
    do {
      const res = await fetch(`${base}/v2/orders/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Square-Version": SQUARE_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location_ids: [location],
          query: {
            filter: {
              date_time_filter: { closed_at: { start_at, end_at } },
              state_filter: { states: ["COMPLETED"] },
            },
            sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
          },
          limit: 200,
          cursor,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, amount: 0, count: 0, message: `Square APIエラー(${res.status}): ${body.slice(0, 250)}` };
      }
      const data = (await res.json()) as { orders?: SquareOrder[]; cursor?: string };
      for (const o of data.orders ?? []) {
        total += netSales(o);
        count++;
      }
      cursor = data.cursor;
    } while (cursor);
  } catch (e) {
    return { ok: false, amount: 0, count: 0, message: e instanceof Error ? e.message : String(e) };
  }

  return { ok: true, amount: Math.round(total), count };
}
