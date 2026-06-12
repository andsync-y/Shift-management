"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { extractTimetreeEvents, type ExtractedEvent } from "@/lib/timetree/extract";

type Media = "image/png" | "image/jpeg" | "image/gif" | "image/webp";
const MEDIA: Media[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

// data URL（"data:image/png;base64,xxxx"）から media type と base64 を取り出す。
function parseDataUrl(dataUrl: string): { media: Media; data: string } | null {
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/);
  if (!m) return null;
  const media = m[1] as Media;
  if (!MEDIA.includes(media)) return null;
  return { media, data: m[2] };
}

// タイムツリー画像から予定を抽出（保存はしない・プレビュー用）。
export async function extractBlackouts(input: {
  imageDataUrl: string;
  year?: number;
}): Promise<{ ok: boolean; events: ExtractedEvent[]; message?: string }> {
  await requireAdmin();
  const parsed = parseDataUrl(input.imageDataUrl);
  if (!parsed) return { ok: false, events: [], message: "対応画像はPNG/JPEG/GIF/WebPです。" };
  const res = await extractTimetreeEvents(parsed.data, parsed.media, { year: input.year });
  if (!res.ok) return { ok: false, events: [], message: res.message };
  if (res.events.length === 0) {
    return { ok: false, events: [], message: "予定を読み取れませんでした。週/日表示の見やすい画像でお試しください。" };
  }
  return { ok: true, events: res.events };
}

// 個別予定（不可時間）を保存する。空時刻は終日不可として NULL 保存。
export async function saveBlackouts(input: {
  staffId: string;
  events: { date: string; start: string; end: string; title: string }[];
}): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const supabase = await createClient();
  if (!input.staffId) return { ok: false, message: "スタッフを選択してください。" };

  const rows = [];
  for (const e of input.events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    const start = /^\d{2}:\d{2}$/.test(e.start) ? e.start : null;
    const end = /^\d{2}:\d{2}$/.test(e.end) ? e.end : null;
    // 片側だけの時刻は終日扱い（両方そろわなければ NULL）
    const both = start && end && start < end;
    rows.push({
      staff_id: input.staffId,
      blackout_date: e.date,
      start_time: both ? start : null,
      end_time: both ? end : null,
      title: e.title || null,
      source: "timetree",
    });
  }
  if (rows.length === 0) return { ok: false, message: "保存できる予定がありません。" };

  const { error } = await supabase.from("staff_blackouts").insert(rows);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin/blackouts");
  return { ok: true, message: `${rows.length}件の予定を不可時間として登録しました。` };
}

export async function deleteBlackout(id: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("staff_blackouts").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/blackouts");
  return { ok: true, message: "削除しました。" };
}
