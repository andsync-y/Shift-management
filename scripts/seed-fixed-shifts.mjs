// =====================================================================
// 固定シフト投入スクリプト（HTMLシフト表の確定週次パターンより）
// =====================================================================
// 既存スタッフ（氏名で照合）に対し、週次の固定シフトを登録する。
// 固定シフト制運用で「📌 固定シフトを展開」を使う前提データ。
//
// 使い方:
//   1. 先に npm run seed:staff でスタッフを登録しておく
//   2. .env.local に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を設定
//   3. npm run seed:fixed
//
// ※ パターンは 6/20-6/26 のシフト表に基づく目安です。実運用に合わせて
//   管理画面のスタッフ詳細「固定シフト」で調整してください。
// =====================================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* noop */
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。");
  process.exit(1);
}
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// シフト種別 → 時刻
const SHIFT = {
  early: { start: "10:00", end: "19:00" }, // 早番
  late: { start: "13:00", end: "22:00" }, // 遅番
  short_5h: { start: "10:00", end: "15:00" }, // 早短5h
  short_6h: { start: "10:00", end: "16:00" }, // 早短6h
};
// 曜日: 0=日,1=月,2=火,3=水,4=木,5=金,6=土

// 氏名 → 固定シフト [曜日, 種別]
const FIXED = {
  "福田 愛奈": [
    [0, "late"], [2, "late"], [4, "late"], [6, "late"],
  ],
  "佐藤 ダヤナラ": [
    [6, "early"], [2, "late"], [3, "late"], [5, "late"],
  ],
  "橋本 美佑香": [
    [0, "late"], [4, "late"], [6, "late"],
  ],
  "桑原 花那": [
    [1, "early"], [4, "early"], [6, "early"],
  ],
  "二俣 清美": [
    [2, "short_5h"], [3, "late"], [4, "short_5h"], [5, "short_5h"],
  ],
  "川島 愛由": [
    [0, "early"], [1, "late"], [2, "short_5h"], [3, "early"], [5, "short_5h"],
  ],
  "紙坂 香代": [
    [1, "short_6h"], [2, "early"], [3, "short_6h"], [5, "early"],
  ],
};

async function main() {
  console.log("固定シフトの投入を開始します...");

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name");
  if (error) throw error;
  const byName = new Map((profiles ?? []).map((p) => [p.full_name, p.id]));

  for (const [name, slots] of Object.entries(FIXED)) {
    const id = byName.get(name);
    if (!id) {
      console.warn(`  ! ${name} が見つかりません（先に seed:staff を実行してください）。スキップ。`);
      continue;
    }
    // 既存の固定シフトを入れ替え
    await supabase.from("fixed_shifts").delete().eq("staff_id", id);
    const rows = slots.map(([dow, type]) => ({
      staff_id: id,
      day_of_week: dow,
      start_time: SHIFT[type].start,
      end_time: SHIFT[type].end,
      shift_type: type,
    }));
    const { error: insErr } = await supabase.from("fixed_shifts").insert(rows);
    if (insErr) {
      console.error(`  ✗ ${name}: ${insErr.message}`);
      continue;
    }
    console.log(`  ✓ ${name}（固定シフト ${rows.length}件）`);
  }

  console.log("\n完了しました。管理画面の「シフト作成」→「📌 固定シフトを展開」でご確認ください。");
}

main().catch((e) => {
  console.error("投入に失敗しました:", e);
  process.exit(1);
});
