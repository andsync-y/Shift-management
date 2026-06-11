"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PREOPEN_BEDS, findRound } from "@/lib/preopen";

// モデル客を1枠に登録する。1枠 PREOPEN_BEDS(=4) 名を超えたら拒否。
export async function addReservation(input: {
  date: string;
  start: string;
  customerName: string;
}): Promise<{ ok: boolean; message: string }> {
  const me = await requireUser();
  const supabase = await createClient();

  const name = input.customerName.trim();
  if (!name) return { ok: false, message: "お客様の名前を入力してください。" };

  const slot = findRound(input.date, input.start);
  if (!slot) return { ok: false, message: "枠の指定が不正です。" };

  // 上限チェック（その枠の全予約数）
  const { count } = await supabase
    .from("preopen_reservations")
    .select("*", { count: "exact", head: true })
    .eq("reserve_date", input.date)
    .eq("start_time", slot.round.start);
  if ((count ?? 0) >= PREOPEN_BEDS) {
    return { ok: false, message: `この枠は満席（${PREOPEN_BEDS}名）です。別の時間を選んでください。` };
  }

  const { error } = await supabase.from("preopen_reservations").insert({
    staff_id: me.id,
    reserve_date: input.date,
    start_time: slot.round.start,
    end_time: slot.round.end,
    customer_name: name,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/staff/preopen");
  revalidatePath("/admin/preopen");
  return { ok: true, message: "予約を登録しました。" };
}

// 予約を削除（RLSにより本人ぶん or オーナーのみ実際に消える）。
export async function removeReservation(id: string): Promise<{ ok: boolean; message: string }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("preopen_reservations").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/staff/preopen");
  revalidatePath("/admin/preopen");
  return { ok: true, message: "削除しました。" };
}
