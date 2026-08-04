"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PREOPEN_STAFFING, PREOPEN_DAYS } from "@/lib/preopen";

function surname(name: string) {
  return name.split(/[\s　]/)[0];
}

const VALID_DATES = new Set(PREOPEN_DAYS.map((d) => d.date));

export type ShiftInput = {
  date: string;
  staffId: string;
  start: string; // "HH:MM"
  end: string;
  training: boolean;
  noServe: boolean; // true = 施術不可（受付に数えない）
};

function revalidate() {
  revalidatePath("/admin/preopen");
  revalidatePath("/staff/preopen");
}

// プレオープン出勤シフトを丸ごと置き換える（編集画面の保存）。
export async function savePreopenShifts(
  rows: ShiftInput[]
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const seen = new Set<string>();
  for (const r of rows) {
    if (!VALID_DATES.has(r.date)) return { ok: false, message: "対象日が不正です。" };
    if (!r.staffId) return { ok: false, message: "スタッフを選択してください。" };
    if (!/^\d{2}:\d{2}$/.test(r.start) || !/^\d{2}:\d{2}$/.test(r.end) || r.start >= r.end) {
      return { ok: false, message: `勤務時間が不正です（${r.date}）。開始は終了より前にしてください。` };
    }
    const key = r.date + "_" + r.staffId;
    if (seen.has(key)) {
      return { ok: false, message: "同じ日に同じスタッフが重複しています。" };
    }
    seen.add(key);
  }

  // 全件入れ替え
  const { error: delErr } = await supabase
    .from("preopen_shifts")
    .delete()
    .gte("reserve_date", "1900-01-01");
  if (delErr) return { ok: false, message: delErr.message };

  if (rows.length > 0) {
    const { error } = await supabase.from("preopen_shifts").insert(
      rows.map((r) => ({
        reserve_date: r.date,
        staff_id: r.staffId,
        start_time: r.start,
        end_time: r.end,
        is_training: r.training,
        can_serve: !r.noServe,
      }))
    );
    if (error) return { ok: false, message: error.message };
  }

  revalidate();
  return { ok: true, message: "シフトを保存しました。" };
}

// 初期シフト（雛形）を読み込んで置き換える。姓でスタッフを照合する。
export async function resetPreopenShifts(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: profiles } = await supabase.from("profiles").select("id, full_name");
  const byName = new Map<string, string>();
  for (const p of (profiles ?? []) as { id: string; full_name: string }[]) {
    byName.set(surname(p.full_name), p.id);
  }

  const rows: {
    reserve_date: string;
    staff_id: string;
    start_time: string;
    end_time: string;
    is_training: boolean;
  }[] = [];
  const missing: string[] = [];
  for (const [date, list] of Object.entries(DEFAULT_PREOPEN_STAFFING)) {
    for (const s of list) {
      const id = byName.get(s.name);
      if (!id) {
        if (!missing.includes(s.name)) missing.push(s.name);
        continue;
      }
      rows.push({
        reserve_date: date,
        staff_id: id,
        start_time: s.start,
        end_time: s.end,
        is_training: s.isTraining ?? false,
      });
    }
  }

  await supabase.from("preopen_shifts").delete().gte("reserve_date", "1900-01-01");
  if (rows.length > 0) {
    const { error } = await supabase.from("preopen_shifts").insert(rows);
    if (error) return { ok: false, message: error.message };
  }

  revalidate();
  return {
    ok: true,
    message:
      missing.length > 0
        ? `初期シフトを読み込みました（未登録で除外: ${missing.join("・")}）。`
        : "初期シフトを読み込みました。",
  };
}
