import { createAdminClient } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createAdminClient>;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// 古いキオスク打刻写真を削除する（容量・privacy対策）。
// 保存パスは `YYYY-MM-DD/<staffId>-<ts>.jpg`。日付フォルダ単位で cutoff より古いものを消す。
// あわせて time_records の写真URL参照も null に戻す。
export async function purgeOldPunchPhotos(admin: Admin, days = 90) {
  const j = new Date(Date.now() + 9 * 3600 * 1000 - days * 86400000);
  const cutoff = `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}`; // この日より前を削除

  const { data: folders } = await admin.storage.from("punch-photos").list("", { limit: 2000 });
  const oldFolders = ((folders ?? []) as { id: string | null; name: string }[]).filter(
    (f) => f.id === null && /^\d{4}-\d{2}-\d{2}$/.test(f.name) && f.name < cutoff
  );

  let removed = 0;
  for (const f of oldFolders) {
    const { data: files } = await admin.storage.from("punch-photos").list(f.name, { limit: 2000 });
    const paths = ((files ?? []) as { name: string }[]).map((x) => `${f.name}/${x.name}`);
    if (paths.length) {
      const { error } = await admin.storage.from("punch-photos").remove(paths);
      if (!error) removed += paths.length;
    }
  }

  // DB側の参照もクリア（リンク切れ防止）
  await admin
    .from("time_records")
    .update({ in_photo_url: null, out_photo_url: null })
    .lt("work_date", cutoff)
    .or("in_photo_url.not.is.null,out_photo_url.not.is.null");

  return { cutoff, folders: oldFolders.length, removed };
}
