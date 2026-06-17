// 画面に出す短い名前。display_name（ニックネーム）があればそれを優先し、
// 無ければ氏名の先頭（苗字）を返す。マッチング用途では使わない（表示専用）。
export function displayName(p: { display_name?: string | null; full_name: string }): string {
  const d = p.display_name?.trim();
  if (d) return d;
  return p.full_name.split(/[\s　]/)[0];
}
