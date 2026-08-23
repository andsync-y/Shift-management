// =====================================================================
// 給与明細PDF（1人1枚・A4横）
// =====================================================================
// 印刷ページ（/admin/payroll/print）と同じ「給与明細書グリッド」を
// pdf-lib で描画する。日本語は同梱の Noto Sans JP（サブセット）を埋め込む。
// フォントは public/fonts/NotoSansJP-Medium-sub.ttf（呼び出し側が取得して渡す）。
// =====================================================================

import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export interface PayslipData {
  staffName: string;
  monthLabel: string; // 例 "2026年6月"
  payDateLabel: string; // 例 "2026年7月15日"
  storeName: string;
  workedDays: number;
  workedLabel: string; // "54時間4分"
  overtimeLabel: string;
  nightLabel: string;
  basePay: number;
  overtimePay: number;
  nightPay: number;
  commute: number;
  nominationCount: number;
  nominationBack: number;
  kaisukenCount: number;
  kaisukenBack: number;
  adjustment: number; // 月別の調整（立替精算・臨時手当など。プラス=支給／マイナス=控除）
  adjustmentLabel: string | null;
  gross: number;
  healthInsurance: number;
  pension: number;
  empInsurance: number;
  socialTotal: number;
  taxableBase: number;
  incomeTax: number;
  taxColumnLabel: string; // "甲欄" | "乙欄"
  residentTax: number; // 住民税（現状0）
  net: number;
  kaigo: boolean;
}

const PAGE_W = 841.89; // A4 landscape (pt)
const PAGE_H = 595.28;
const MARGIN_X = 57; // ≒20mm
const MARGIN_Y = 45; // ≒16mm

const INK = rgb(0.1, 0.17, 0.29); // #1a2b4a
const BAND = rgb(0.86, 0.9, 0.95); // #dbe5f1

const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;

// ⚠️ subset:true は pdf-lib(fontkit) のサブセッターがこのフォントのグリフを
//    欠落させるため使わない（数字・かなが描画されなくなる）。丸ごと埋め込み。
export async function buildPayslipPdf(data: PayslipData, fontBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });
  const page = doc.addPage([PAGE_W, PAGE_H]);
  drawPayslip(page, font, data);
  return doc.save();
}

// 複数人を1つのPDF（1人1ページ）にまとめる版。フォントは全ページで共有される。
export async function buildPayslipsPdf(list: PayslipData[], fontBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });
  for (const data of list) drawPayslip(doc.addPage([PAGE_W, PAGE_H]), font, data);
  return doc.save();
}

function drawPayslip(page: PDFPage, font: PDFFont, d: PayslipData) {
  const x0 = MARGIN_X;
  const tableW = PAGE_W - MARGIN_X * 2;
  const secW = 30;
  const colW = (tableW - secW) / 4;
  let y = PAGE_H - MARGIN_Y; // 上端から描き下ろす

  const line = (x1: number, y1: number, x2: number, y2: number, w = 1.2) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: w, color: INK });
  const text = (s: string, x: number, ty: number, size = 10, opts: { right?: number; bold?: boolean } = {}) => {
    const w = font.widthOfTextAtSize(s, size);
    page.drawText(s, { x: opts.right != null ? opts.right - w : x, y: ty, size, font, color: INK });
  };
  const band = (bx: number, by: number, bw: number, bh: number) =>
    page.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: BAND });

  // ---- 見出し ----
  const headH = 30;
  const metaH = 20;
  band(x0, y - headH, tableW, 0); // no-op keep structure
  page.drawRectangle({ x: x0, y: y - headH, width: tableW, height: headH, borderColor: INK, borderWidth: 1.4 });
  text(`${d.monthLabel} 給与明細書`, x0 + 10, y - headH + 9, 13);
  text(`${d.staffName} 様`, 0, y - headH + 9, 12, { right: x0 + tableW - 10 });
  y -= headH;
  page.drawRectangle({ x: x0, y: y - metaH, width: tableW, height: metaH, borderColor: INK, borderWidth: 1.2 });
  text(`${d.payDateLabel}支給　${d.storeName}`, 0, y - metaH + 6, 9, { right: x0 + tableW - 10 });
  y -= metaH;

  // ---- グリッド描画ヘルパ（見出し行＋値行のペア）----
  const headRowH = 20;
  const valRowH = 24;
  const drawPair = (labels: string[], values: string[], boldIdx: number[] = []) => {
    // 見出し行
    band(x0 + secW, y - headRowH, tableW - secW, headRowH);
    for (let i = 0; i < 4; i++) {
      const cx = x0 + secW + colW * i;
      page.drawRectangle({ x: cx, y: y - headRowH, width: colW, height: headRowH, borderColor: INK, borderWidth: 1 });
      if (labels[i]) text(labels[i], cx + 6, y - headRowH + 6, 8.5);
    }
    y -= headRowH;
    // 値行
    for (let i = 0; i < 4; i++) {
      const cx = x0 + secW + colW * i;
      page.drawRectangle({ x: cx, y: y - valRowH, width: colW, height: valRowH, borderColor: INK, borderWidth: 1 });
      if (values[i]) text(values[i], 0, y - valRowH + 8, boldIdx.includes(i) ? 11.5 : 10.5, { right: cx + colW - 7 });
    }
    y -= valRowH;
  };
  const drawSection = (label: string, pairs: { labels: string[]; values: string[]; bold?: number[] }[]) => {
    const secH = pairs.length * (headRowH + valRowH);
    band(x0, y - secH, secW, secH);
    page.drawRectangle({ x: x0, y: y - secH, width: secW, height: secH, borderColor: INK, borderWidth: 1.2 });
    // 縦書き風に1文字ずつ
    const chars = label.split("");
    const startY = y - secH / 2 + (chars.length * 12) / 2 - 10;
    chars.forEach((c, i) => {
      const w = font.widthOfTextAtSize(c, 10);
      page.drawText(c, { x: x0 + (secW - w) / 2, y: startY - i * 13, size: 10, font, color: INK });
    });
    for (const p of pairs) drawPair(p.labels, p.values, p.bold ?? []);
  };

  // ---- 勤務 ----
  drawSection("勤務", [
    {
      labels: ["勤務日数", "実働時間", "うち残業", "うち深夜"],
      values: [`${d.workedDays}日`, d.workedLabel, d.overtimeLabel, d.nightLabel],
    },
  ]);

  // ---- 支給 ----
  drawSection("支給", [
    {
      labels: ["基本給", "残業手当", "深夜手当", "通勤費（非課税）"],
      values: [yen(d.basePay), yen(d.overtimePay), yen(d.nightPay), yen(d.commute)],
    },
    {
      labels: [
        `指名バック（${d.nominationCount}本）`,
        `回数券バック（${d.kaisukenCount}本）`,
        d.adjustment !== 0 ? d.adjustmentLabel ?? "調整" : "調整",
        "支給額合計",
      ],
      values: [
        yen(d.nominationBack),
        yen(d.kaisukenBack),
        d.adjustment !== 0 ? yen(d.adjustment) : "—",
        yen(d.gross),
      ],
      bold: [3],
    },
  ]);

  // ---- 控除 ----
  drawSection("控除", [
    {
      labels: [`健康保険${d.kaigo ? "（介護含む）" : ""}`, "厚生年金", "雇用保険", "社会保険計"],
      values: [yen(d.healthInsurance), yen(d.pension), yen(d.empInsurance), `(${yen(d.socialTotal)})`],
    },
    {
      labels: ["課税対象額", `所得税（${d.taxColumnLabel}）`, "住民税", "控除計"],
      values: [`(${yen(d.taxableBase)})`, yen(d.incomeTax), yen(d.residentTax), yen(d.socialTotal + d.incomeTax)],
      bold: [3],
    },
  ]);

  // ---- 差引支給額 ----
  const totalH = 34;
  band(x0, y - totalH, tableW - colW, totalH);
  page.drawRectangle({ x: x0, y: y - totalH, width: tableW - colW, height: totalH, borderColor: INK, borderWidth: 1.2 });
  text("差引支給額", 0, y - totalH + 11, 12, { right: x0 + tableW - colW - 10 });
  page.drawRectangle({ x: x0 + tableW - colW, y: y - totalH, width: colW, height: totalH, borderColor: INK, borderWidth: 1.4 });
  text(yen(d.net), 0, y - totalH + 10, 15, { right: x0 + tableW - 8 });
  y -= totalH;

  // ---- 注記 ----
  text(
    "※ 賃金は1分単位で計算。通勤費は非課税として課税対象から除外。所得税は源泉徴収税額表（令和8年分）月額表による。",
    x0,
    y - 16,
    7.5
  );

  // 外枠を太めに
  line(x0, PAGE_H - MARGIN_Y, x0 + tableW, PAGE_H - MARGIN_Y, 1.6);
}
