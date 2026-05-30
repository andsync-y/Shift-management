"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function reviewRequest(
  requestId: string,
  status: "approved" | "rejected"
) {
  const admin = await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("time_off_requests")
    .update({
      status,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  revalidatePath("/admin/requests");
}
