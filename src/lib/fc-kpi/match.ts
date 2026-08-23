// 本部KPIの「担当名」とアプリのスタッフを突合する（給与への取込で共用）。
// 本部側は表示名（AINA など）で出てくるが、登録が氏名だけの人もいるので両方で引く。

export interface StaffNameRow {
  id: string;
  full_name: string;
  display_name: string | null;
}

/** 表示名・氏名 → staff_id の索引。表示名を優先し、同名は先勝ち。 */
export function buildNameIndex(staff: StaffNameRow[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const s of staff) {
    if (s.display_name?.trim()) idx.set(s.display_name.trim(), s.id);
  }
  for (const s of staff) {
    const n = s.full_name?.trim();
    if (n && !idx.has(n)) idx.set(n, s.id);
  }
  return idx;
}

export interface MatchResult {
  rows: { staff_id: string; count: number }[];
  /** 突合できなかった担当（「名前(3本)」の形で案内に出す） */
  unmatched: string[];
  total: number;
}

/** 担当名つきの件数を staff_id に置き換える。未一致は件数つきで返す。 */
export function matchStaffCounts(
  index: Map<string, string>,
  entries: { name: string; count: number }[],
  unit = "件"
): MatchResult {
  const rows: { staff_id: string; count: number }[] = [];
  const unmatched: string[] = [];
  let total = 0;
  for (const e of entries) {
    const name = (e.name ?? "").trim();
    if (!name) continue;
    const count = Math.max(0, Math.round(e.count) || 0);
    total += count;
    const id = index.get(name);
    if (id) rows.push({ staff_id: id, count });
    else unmatched.push(`${name}(${count}${unit})`);
  }
  return { rows, unmatched, total };
}

export interface TicketSaleRow {
  name: string;
  newCount: number;
  renewalCount: number | null;
}

export interface TicketCounts {
  entries: { name: string; count: number }[];
  /** 更新販売数の列が取れていない担当がいた＝本数が不足しうる */
  renewalMissing: boolean;
}

/**
 * 担当別の 新規販売数＋更新販売数 ＝ 回数券バックの本数。
 * renewalCount が null（本部の表に更新の列が無い）のときは新規だけになるため、
 * 呼び出し側で警告できるよう renewalMissing を立てる。
 */
export function ticketCountsFrom(rows: TicketSaleRow[]): TicketCounts {
  let renewalMissing = false;
  const entries = rows.map((r) => {
    const n = Math.max(0, Math.round(r.newCount) || 0);
    if (r.renewalCount == null) renewalMissing = true;
    const u = Math.max(0, Math.round(r.renewalCount ?? 0) || 0);
    return { name: r.name, count: n + u };
  });
  return { entries, renewalMissing };
}
