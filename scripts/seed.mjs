// =====================================================================
// 動作確認用の初期データ投入スクリプト
// =====================================================================
// 使い方:
//   1. .env.local に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を設定
//   2. npm run seed
//
// サンプルの管理者1名・スタッフ3名・希望シフト・必要人数・翌月のシフト期間を作成する。
// service role キーを使うため、ローカル/検証環境でのみ実行すること。
// =====================================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// .env.local を簡易読み込み（dotenv 非依存）
function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env.local が無い場合は既存の環境変数を利用
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください（.env.local など）。"
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const STAFF = [
  {
    email: "admin@example.com",
    password: "password123",
    full_name: "店長（管理者）",
    role: "super_admin",
    employment_type: "full_time",
    display_color: "#e8380d",
    min: 30,
    max: 40,
  },
  {
    email: "trainer1@example.com",
    password: "password123",
    full_name: "田中 太郎",
    role: "staff",
    employment_type: "full_time",
    display_color: "#2563eb",
    min: 30,
    max: 40,
  },
  {
    email: "trainer2@example.com",
    password: "password123",
    full_name: "鈴木 花子",
    role: "staff",
    employment_type: "part_time",
    display_color: "#16a34a",
    min: 12,
    max: 24,
  },
  {
    email: "trainer3@example.com",
    password: "password123",
    full_name: "佐藤 次郎",
    role: "staff",
    employment_type: "part_time",
    display_color: "#9333ea",
    min: 8,
    max: 20,
  },
];

async function upsertStaff(s) {
  // 既存ユーザーを考慮して作成（失敗時はメールで検索）
  let userId;
  const { data: created, error } = await supabase.auth.admin.createUser({
    email: s.email,
    password: s.password,
    email_confirm: true,
    user_metadata: { full_name: s.full_name, role: s.role },
  });
  if (error) {
    // 既に存在する場合は一覧から探す
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
    role: s.role,
    employment_type: s.employment_type,
    min_hours_per_week: s.min,
    max_hours_per_week: s.max,
    display_color: s.display_color,
  });

  return userId;
}

async function seedAvailability(staffId) {
  // 月〜土の 10:00-19:00 を勤務可（火曜は休み希望に近い形で未登録）
  const rows = [];
  for (let dow = 1; dow <= 6; dow++) {
    if (dow === 2) continue; // 火曜は登録しない（不可扱い）
    rows.push({
      staff_id: staffId,
      day_of_week: dow,
      start_time: "10:00",
      end_time: "19:00",
      preference: dow === 1 || dow === 5 ? "preferred" : "available",
    });
  }
  await supabase.from("availability_preferences").insert(rows);
}

async function seedPeriod() {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 2; // 翌月
  if (month > 12) {
    month = 1;
    year += 1;
  }

  const { data: period, error } = await supabase
    .from("shift_periods")
    .upsert({ year, month }, { onConflict: "year,month" })
    .select()
    .single();
  if (error) throw error;

  // 既存の必要人数を消してから登録
  await supabase.from("shift_requirements").delete().eq("period_id", period.id);

  const reqs = [];
  for (let dow = 0; dow <= 6; dow++) {
    if (dow === 2) continue; // 火曜定休
    // 午前と午後で必要人数を分ける
    reqs.push(
      { period_id: period.id, day_of_week: dow, start_time: "10:00", end_time: "14:00", required_staff: 2 },
      { period_id: period.id, day_of_week: dow, start_time: "14:00", end_time: "19:00", required_staff: 2 }
    );
  }
  await supabase.from("shift_requirements").insert(reqs);

  return { year, month };
}

async function main() {
  console.log("シードを開始します...");
  for (const s of STAFF) {
    const id = await upsertStaff(s);
    if (s.role === "staff") await seedAvailability(id);
    console.log(`  ✓ ${s.full_name} (${s.email})`);
  }
  const { year, month } = await seedPeriod();
  console.log(`  ✓ シフト期間 ${year}年${month}月 と必要人数を作成`);
  console.log("\n完了しました。ログイン例: admin@example.com / password123");
  console.log("（管理画面の「シフト作成」からAI自動生成を試せます）");
}

main().catch((e) => {
  console.error("シードに失敗しました:", e);
  process.exit(1);
});
