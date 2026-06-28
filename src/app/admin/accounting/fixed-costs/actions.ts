"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

const monthOpt = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}$/.test(v), "月は YYYY-MM 形式")
  .optional()
  .or(z.literal(""));

const schema = z.object({
  name: z.string().trim().min(1, "名称を入力してください"),
  amount: z.coerce.number().int().nonnegative(),
  category: z.string().trim().optional().or(z.literal("")),
  pl_expense: z.coerce.boolean().optional(),
  start_month: monthOpt,
  end_month: monthOpt,
});

function parse(formData: FormData) {
  const obj = {
    name: formData.get("name"),
    amount: formData.get("amount"),
    category: formData.get("category"),
    pl_expense: formData.get("pl_expense") === "on" || formData.get("pl_expense") === "true",
    start_month: formData.get("start_month") ?? "",
    end_month: formData.get("end_month") ?? "",
  };
  return schema.safeParse(obj);
}

export async function createFixedCost(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const p = parse(formData);
  if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const d = p.data;
  const supabase = await createClient();
  const { error } = await supabase.from("fixed_costs").insert({
    name: d.name,
    amount: d.amount,
    category: d.category || null,
    pl_expense: d.pl_expense ?? true,
    start_month: d.start_month ? d.start_month : null,
    end_month: d.end_month ? d.end_month : null,
  });
  if (error) return { ok: false, message: `追加に失敗: ${error.message}` };
  revalidatePath("/admin/accounting/fixed-costs");
  revalidatePath("/admin/accounting");
  return { ok: true, message: "追加しました。" };
}

export async function updateFixedCost(id: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const p = parse(formData);
  if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const d = p.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("fixed_costs")
    .update({
      name: d.name,
      amount: d.amount,
      category: d.category || null,
      pl_expense: d.pl_expense ?? true,
      start_month: d.start_month ? d.start_month : null,
      end_month: d.end_month ? d.end_month : null,
    })
    .eq("id", id);
  if (error) return { ok: false, message: `更新に失敗: ${error.message}` };
  revalidatePath("/admin/accounting/fixed-costs");
  revalidatePath("/admin/accounting");
  return { ok: true, message: "更新しました。" };
}

export async function deleteFixedCost(id: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("fixed_costs").delete().eq("id", id);
  revalidatePath("/admin/accounting/fixed-costs");
  revalidatePath("/admin/accounting");
}
