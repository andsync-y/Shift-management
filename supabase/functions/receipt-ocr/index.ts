// =====================================================================
// 経理システム② 領収書OCR Edge Function（Gemini 1.5 Flash・マルチモーダル）
// =====================================================================
// スマホで複数の領収書を並べて撮った1枚の画像（Supabase Storage 保存済）を読み込み、
// Gemini 1.5 Flash で各領収書を {date, amount, merchant} として検出し JSON配列で返す。
//
// 必要な環境変数（supabase secrets set ...）:
//   GEMINI_API_KEY              … Google AI Studio の API キー
//   SUPABASE_URL                … 自動付与
//   SUPABASE_SERVICE_ROLE_KEY   … 自動付与（Storage ダウンロード/receipts 追加に使用）
//
// 呼び出し（POST JSON）:
//   { "path": "uploads/xxx.jpg", "bucket": "receipts", "insert": true }
//     path   : Storage 内の画像パス（必須）
//     bucket : バケット名（既定 "receipts"）
//     insert : true なら検出結果を receipts テーブルへ status='pending' で登録
// 返却: { ok: true, receipts: [{date, amount, merchant}], inserted: number }
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

const PROMPT = `あなたは日本の経理担当者です。これは「複数の領収書・レシートを並べて1枚に撮影した画像」です。
画像内のレシート/領収書を1枚ずつ検出し、それぞれについて以下を読み取ってください。

各レシートの抽出項目:
- date: 日付。"YYYY-MM-DD" 形式。和暦・スラッシュ等は西暦ハイフンに正規化。年が無ければ当年とみなす。読めなければ null。
- amount: 支払合計金額（税込）。数値のみ（円記号・カンマ・「円」を除く整数または小数）。小計や預り金ではなく「合計」。読めなければ null。
- merchant: 支払先（店名・会社名）。読めなければ null。

厳守ルール:
- レシート/領収書でないもの（メモ、商品、背景）は出力に含めない。
- 推測で値を捏造しない。読めない項目は必ず null。
- 出力は JSON のみ。前後に説明文・コードフェンス・余計なキーを付けない。
- 形式は必ず次の配列: {"receipts":[{"date":"YYYY-MM-DD","amount":1234,"merchant":"..."}]}
- 1枚も検出できなければ {"receipts":[]} を返す。`;

type Detected = { date: string | null; amount: number | null; merchant: string | null };

function cors(extra: Record<string, string> = {}): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    ...extra,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "POST のみ" }), { status: 405, headers: cors() });
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return new Response(JSON.stringify({ ok: false, error: "GEMINI_API_KEY 未設定" }), { status: 500, headers: cors() });
  }

  let body: { path?: string; bucket?: string; insert?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "不正なJSON" }), { status: 400, headers: cors() });
  }
  const path = body.path;
  const bucket = body.bucket ?? "receipts";
  if (!path) {
    return new Response(JSON.stringify({ ok: false, error: "path が必要です" }), { status: 400, headers: cors() });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 1) Storage から画像を取得
  const { data: file, error: dlErr } = await supabase.storage.from(bucket).download(path);
  if (dlErr || !file) {
    return new Response(JSON.stringify({ ok: false, error: `画像取得失敗: ${dlErr?.message ?? "not found"}` }), {
      status: 404,
      headers: cors(),
    });
  }
  const mime = file.type || "image/jpeg";
  const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));

  // 2) Gemini へマルチモーダル要求（JSON強制）
  const gemRes = await fetch(GEMINI_URL(geminiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: base64 } }] },
      ],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!gemRes.ok) {
    const errBody = await gemRes.text();
    return new Response(JSON.stringify({ ok: false, error: `Gemini エラー(${gemRes.status}): ${errBody.slice(0, 300)}` }), {
      status: 502,
      headers: cors(),
    });
  }
  const gem = await gemRes.json();
  const text: string = gem?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";

  let receipts: Detected[] = [];
  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text);
    receipts = Array.isArray(parsed?.receipts) ? parsed.receipts : [];
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "AI応答の解析に失敗", raw: text.slice(0, 500) }), {
      status: 502,
      headers: cors(),
    });
  }

  // 正規化（金額を数値化・日付形式チェック）
  const clean: Detected[] = receipts.map((r) => ({
    date: typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null,
    amount: typeof r.amount === "number" && isFinite(r.amount) ? r.amount : null,
    merchant: typeof r.merchant === "string" && r.merchant.trim() ? r.merchant.trim() : null,
  }));

  // 3) 任意: receipts テーブルへ登録（status='pending'）。マッチングトリガーが発火。
  let inserted = 0;
  if (body.insert && clean.length > 0) {
    const rows = clean.map((r) => ({
      image_url: path,
      detected_date: r.date,
      detected_amount: r.amount,
      detected_merchant: r.merchant,
      status: "pending",
    }));
    const { error: insErr, count } = await supabase
      .from("receipts")
      .insert(rows, { count: "exact" });
    if (insErr) {
      return new Response(JSON.stringify({ ok: false, error: `receipts登録失敗: ${insErr.message}`, receipts: clean }), {
        status: 500,
        headers: cors(),
      });
    }
    inserted = count ?? rows.length;
  }

  return new Response(JSON.stringify({ ok: true, receipts: clean, inserted }), { headers: cors() });
});
