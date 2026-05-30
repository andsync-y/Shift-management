// =====================================================================
// 全力ストレッチ岐阜長良店：実スタッフ（最終候補者）投入スクリプト
// =====================================================================
// 候補者リスト/シフト表から「シフト管理に必要な項目」だけを抽出して登録する。
// （年齢・経営戦略・NDA・研修・社保コスト等の運用メモは対象外）
//
// 使い方:
//   1. .env.local に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を設定
//   2. npm run seed:staff
//
// ⚠️ メールアドレス/初期パスワードはプレースホルダーです。実運用前に
//    各スタッフの実メールアドレスへ変更し、本人にパスワード変更を案内してください。
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
    /* .env.local が無ければ既存環境変数を使用 */
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

const DEFAULT_PASSWORD = "zenryoku2026"; // ★初回ログイン後に各自変更を案内すること

// 曜日: 0=日,1=月,2=火,3=水,4=木,5=金,6=土
// preference: "preferred"(優先) / "available"(可) / "unavailable"(不可)
const STAFF = [
  {
    full_name: "福田 愛奈",
    email: "fukuda.aina@zenryoku-nagara.example.com",
    employment_type: "part_time",
    min: 28,
    max: 40,
    color: "#e8380d",
    // 遅番(13-22)希望・土日可・週4〜5
    availability: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      start_time: "13:00",
      end_time: "22:00",
      preference: "preferred",
    })),
  },
  {
    full_name: "佐藤 ダヤナラ",
    email: "sato.dayanara@zenryoku-nagara.example.com",
    employment_type: "part_time",
    min: 32,
    max: 40,
    color: "#2563eb",
    // 週5フルタイム・早遅どちらも可・土日可（10-22で両対応）
    availability: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      start_time: "10:00",
      end_time: "22:00",
      preference: "preferred",
    })),
  },
  {
    full_name: "橋本 美佑香",
    email: "hashimoto.miyuka@zenryoku-nagara.example.com",
    employment_type: "part_time",
    min: 20,
    max: 40,
    color: "#16a34a",
    // 遅番中心・週3〜5（体力配慮で当面は下限）
    availability: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      day_of_week: d,
      start_time: "13:00",
      end_time: "22:00",
      preference: "available",
    })),
  },
  {
    full_name: "桑原 花那",
    email: "kuwahara.kana@zenryoku-nagara.example.com",
    employment_type: "part_time",
    min: 20,
    max: 32,
    color: "#9333ea",
    // 早番中心・週3〜4・土曜は必須・日曜は不可の可能性（日は登録しない）
    availability: [
      { day_of_week: 1, start_time: "10:00", end_time: "19:00", preference: "available" },
      { day_of_week: 2, start_time: "10:00", end_time: "19:00", preference: "available" },
      { day_of_week: 3, start_time: "10:00", end_time: "19:00", preference: "available" },
      { day_of_week: 4, start_time: "10:00", end_time: "19:00", preference: "available" },
      { day_of_week: 5, start_time: "10:00", end_time: "19:00", preference: "available" },
      { day_of_week: 6, start_time: "10:00", end_time: "19:00", preference: "preferred" }, // 土曜フル必須
    ],
  },
  {
    full_name: "二俣 清美",
    email: "futamata.kiyomi@zenryoku-nagara.example.com",
    employment_type: "part_time",
    min: 20,
    max: 25,
    color: "#0891b2",
    // 火木金:早短10-15 / 水:遅番13-22 / 日:出勤可 / 土:不可（月は登録しない）
    availability: [
      { day_of_week: 0, start_time: "10:00", end_time: "19:00", preference: "available" }, // 日(日による)
      { day_of_week: 2, start_time: "10:00", end_time: "15:00", preference: "available" }, // 火 早短
      { day_of_week: 3, start_time: "13:00", end_time: "22:00", preference: "preferred" }, // 水 遅番
      { day_of_week: 4, start_time: "10:00", end_time: "15:00", preference: "available" }, // 木 早短
      { day_of_week: 5, start_time: "10:00", end_time: "15:00", preference: "available" }, // 金 早短
    ],
  },
  {
    full_name: "川島",
    email: "kawashima@zenryoku-nagara.example.com",
    employment_type: "part_time",
    min: 30, // 社保加入要件（週約30h）を満たす設計
    max: 40,
    color: "#ca8a04",
    // 月水:早遅可 / 火金:早短10-15 / 日:早遅可 /（木・土は休）
    availability: [
      { day_of_week: 0, start_time: "10:00", end_time: "22:00", preference: "available" }, // 日
      { day_of_week: 1, start_time: "10:00", end_time: "22:00", preference: "preferred" }, // 月
      { day_of_week: 2, start_time: "10:00", end_time: "15:00", preference: "available" }, // 火 早短
      { day_of_week: 3, start_time: "10:00", end_time: "22:00", preference: "preferred" }, // 水
      { day_of_week: 5, start_time: "10:00", end_time: "15:00", preference: "available" }, // 金 早短
    ],
  },
  {
    full_name: "紙坂",
    email: "kamisaka@zenryoku-nagara.example.com",
    employment_type: "part_time",
    min: 24,
    max: 36,
    color: "#65a30d",
    // 平日のみ・土日不可・遅番NG（終了は最大19:00）
    availability: [
      { day_of_week: 1, start_time: "10:00", end_time: "16:00", preference: "available" }, // 月 早短
      { day_of_week: 2, start_time: "10:00", end_time: "19:00", preference: "available" }, // 火 早番
      { day_of_week: 3, start_time: "10:00", end_time: "16:00", preference: "available" }, // 水 早短
      { day_of_week: 4, start_time: "10:00", end_time: "19:00", preference: "available" }, // 木 早番
      { day_of_week: 5, start_time: "10:00", end_time: "19:00", preference: "available" }, // 金 早番
    ],
  },
];

async function upsertStaff(s) {
  let userId;
  const { data: created, error } = await supabase.auth.admin.createUser({
    email: s.email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: s.full_name, role: "staff" },
  });
  if (error) {
    const { data: list } = await supabase.auth.admin.listUsers();
    const found = list?.users?.find((u) => u.email === s.email);
    if (!found) throw error;
    userId = found.id;
  } else {
    userId = created.user.id;
  }

  await supabase.from("profiles").upsert({
    id: userId,
    full_name: s.full_name,
    role: "staff",
    employment_type: s.employment_type,
    min_hours_per_week: s.min,
    max_hours_per_week: s.max,
    display_color: s.color,
  });

  // 希望シフトを入れ替え（重複防止のため一旦削除）
  await supabase.from("availability_preferences").delete().eq("staff_id", userId);
  if (s.availability.length > 0) {
    await supabase.from("availability_preferences").insert(
      s.availability.map((a) => ({ staff_id: userId, ...a }))
    );
  }
  return userId;
}

async function main() {
  console.log("実スタッフの投入を開始します...");
  for (const s of STAFF) {
    await upsertStaff(s);
    console.log(`  ✓ ${s.full_name}（希望シフト ${s.availability.length}件）`);
  }
  console.log(
    `\n完了しました。${STAFF.length}名を登録。初期パスワードは全員 "${DEFAULT_PASSWORD}" です。`
  );
  console.log("⚠️ メールアドレスはプレースホルダーです。実メールに変更し、各自パスワード変更を案内してください。");
}

main().catch((e) => {
  console.error("投入に失敗しました:", e);
  process.exit(1);
});
