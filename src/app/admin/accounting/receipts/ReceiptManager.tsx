"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CardTransaction, Receipt } from "@/lib/types";
import { deleteReceipt, setReceiptStatus, updateReceipt } from "../actions";
import AccountSelect from "../AccountSelect";

const yen = (n: number | null) => (n == null ? "—" : `¥${Math.round(n).toLocaleString()}`);

// アップロード前にブラウザで縮小・再圧縮する。
// スマホのフル解像度写真（4〜6MB）は Vercel のリクエスト上限(4.5MB)と
// Claude の画像サイズ上限を超えるため。長辺2200px・JPEG品質0.85はレシートOCRに十分。
async function downscaleImage(file: File, maxDim = 2200, quality = 0.85): Promise<Blob> {
  if (file.size < 1.5 * 1024 * 1024) return file; // 小さいものはそのまま
  try {
    const bmp = await createImageBitmap(file); // EXIFの向きは既定で反映される
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // デコードできない形式はそのまま送ってサーバ側のエラーに任せる
  }
}

export default function ReceiptManager({
  receipts,
  cardByReceipt,
  signed,
}: {
  receipts: Receipt[];
  cardByReceipt: Record<string, CardTransaction>;
  signed: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [edit, setEdit] = useState<Record<string, Partial<Receipt>>>({});

  function field<K extends keyof Receipt>(r: Receipt, key: K): Receipt[K] {
    const e = edit[r.id];
    return (e && key in e ? (e[key] as Receipt[K]) : r[key]) as Receipt[K];
  }
  function setField(id: string, key: keyof Receipt, value: unknown) {
    setEdit((s) => ({ ...s, [id]: { ...s[id], [key]: value } }));
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setMsg(null);
    start(async () => {
      let ok = 0;
      let detected = 0;
      let skipped = 0;
      for (const file of Array.from(files)) {
        const blob = await downscaleImage(file);
        const fd = new FormData();
        fd.append("file", blob, blob === file ? file.name : "receipt.jpg");
        const res = await fetch("/api/accounting/receipt-upload", { method: "POST", body: fd });
        const j = await res.json().catch(() => ({}));
        if (j.ok) {
          ok++;
          detected += j.inserted ?? 0;
          skipped += j.skipped ?? 0;
        } else {
          setMsg({ ok: false, text: j.error ?? "アップロードに失敗しました。" });
        }
      }
      if (ok > 0) {
        const skipNote = skipped > 0 ? `（取込済みと重複した${skipped}件はスキップ）` : "";
        setMsg({ ok: true, text: `${ok}枚アップロード、${detected}件の領収書を取り込みました${skipNote}。勘定科目はAI提案済み — 内容を確認して確定してください。` });
        router.refresh();
      }
    });
    e.target.value = "";
  }

  function save(r: Receipt) {
    start(async () => {
      const res = await updateReceipt(r.id, {
        detected_date: (field(r, "detected_date") as string | null) || null,
        detected_amount: field(r, "detected_amount") as number | null,
        detected_merchant: (field(r, "detected_merchant") as string | null) || null,
        suggested_account: (field(r, "suggested_account") as string | null) || null,
      });
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) {
        setEdit((s) => ({ ...s, [r.id]: {} }));
        router.refresh();
      }
    });
  }
  function toggle(r: Receipt) {
    start(async () => {
      const res = await setReceiptStatus(r.id, r.status === "confirmed" ? "pending" : "confirmed");
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });
  }
  function remove(r: Receipt) {
    if (!confirm("この領収書を削除します。よろしいですか？")) return;
    start(async () => {
      const res = await deleteReceipt(r.id);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });
  }

  return (
    <>
      <div className="section">
        <div className="section-head">
          <h2>領収書をアップロード</h2>
          <span className="eyebrow">まとめ撮りOK</span>
        </div>
        <div className="section-body">
          <label className="btn-fill" style={{ cursor: "pointer", display: "inline-block" }}>
            {pending ? "処理中…" : "画像を選んで取り込む"}
            <input type="file" accept="image/*" multiple hidden onChange={onUpload} disabled={pending} />
          </label>
          {msg && (
            <p className="help" style={{ marginTop: 12, marginBottom: 0, color: msg.ok ? "#3d6b4f" : "#9a3a30" }}>
              {msg.text}
            </p>
          )}
          <p className="help" style={{ marginBottom: 0 }}>
            複数の領収書を並べて撮った1枚でもOK（AIが1枚ずつ日付・金額・支払先・<strong>勘定科目</strong>を読み取り・提案します）。
            過去に取り込んだ領収書（日付＋金額＋支払先が同じ）は自動でスキップ。読み取り後、内容を確認して「確定」してください。
          </p>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>領収書一覧</h2>
          <span className="eyebrow">{receipts.length}件</span>
        </div>
        <div className="section-body" style={{ overflowX: "auto", paddingTop: 10 }}>
          {receipts.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>まだ領収書がありません。</p>
          ) : (
            <table className="staff-table" style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>画像</th>
                  <th>日付</th>
                  <th style={{ textAlign: "right" }}>金額</th>
                  <th>支払先</th>
                  <th>勘定科目</th>
                  <th>カード明細</th>
                  <th>状態</th>
                  <th style={{ textAlign: "right" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => {
                  const url = signed[r.image_url];
                  const card = cardByReceipt[r.id];
                  const dirty = edit[r.id] && Object.keys(edit[r.id]).length > 0;
                  return (
                    <tr key={r.id}>
                      <td>
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="領収書" style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 6 }} />
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <input
                          type="date"
                          className="input en"
                          style={{ width: 140 }}
                          value={(field(r, "detected_date") as string | null) ?? ""}
                          onChange={(e) => setField(r.id, "detected_date", e.target.value)}
                          disabled={pending}
                        />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <input
                          type="number"
                          className="input en"
                          style={{ width: 100, textAlign: "right" }}
                          value={(field(r, "detected_amount") as number | null) ?? ""}
                          onChange={(e) => setField(r.id, "detected_amount", e.target.value === "" ? null : Number(e.target.value))}
                          disabled={pending}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          style={{ width: 140 }}
                          value={(field(r, "detected_merchant") as string | null) ?? ""}
                          onChange={(e) => setField(r.id, "detected_merchant", e.target.value)}
                          disabled={pending}
                        />
                      </td>
                      <td>
                        <AccountSelect
                          value={(field(r, "suggested_account") as string | null) ?? ""}
                          onChange={(v) => setField(r.id, "suggested_account", v || null)}
                          disabled={pending}
                        />
                      </td>
                      <td className="soft" style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                        {card ? `${card.transaction_date.slice(5)} ${yen(card.amount)}` : "未照合"}
                      </td>
                      <td>
                        <span className={"status-pill " + (r.status === "confirmed" ? "ok" : "wait")}>
                          {r.status === "confirmed" ? "確定" : "未確定"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {dirty && (
                          <button className="btn-mini" onClick={() => save(r)} disabled={pending}>
                            保存
                          </button>
                        )}
                        <button className="btn-mini" onClick={() => toggle(r)} disabled={pending}>
                          {r.status === "confirmed" ? "取消" : "確定"}
                        </button>
                        <button className="btn-mini ink" onClick={() => remove(r)} disabled={pending}>
                          削除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
