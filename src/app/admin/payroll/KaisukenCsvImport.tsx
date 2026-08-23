"use client";

import { useRef, useState, useTransition } from "react";
import { importKaisukenFromVisitCsv } from "./actions";

// 本部システムの「来店記録」CSVを選ぶだけで、当月の回数券販売本数を担当別に取り込む。
// 本部システムには直接ログインできない（社外からの自動アクセス不可）ため、
// オーナーが本部画面で出したCSVをそのまま渡す方式にしている。
//
// 文字コードは UTF-8(BOM付き) と Shift_JIS の両方が出てくるので、
// UTF-8 で厳密デコードして失敗したら Shift_JIS とみなす。
async function readCsv(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("shift_jis").decode(buf);
  }
}

export default function KaisukenCsvImport({ month }: { month: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input
        ref={ref}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // 同じファイルを選び直せるように
          if (!file) return;
          setMsg(null);
          start(async () => {
            try {
              const r = await importKaisukenFromVisitCsv(month, await readCsv(file));
              setMsg({ ok: r.ok, text: r.message });
            } catch (err) {
              setMsg({ ok: false, text: err instanceof Error ? err.message : "取込に失敗しました。" });
            }
          });
        }}
      />
      <button
        type="button"
        className="btn-outline"
        style={{ fontSize: 12.5, padding: "7px 12px" }}
        disabled={pending}
        onClick={() => ref.current?.click()}
      >
        {pending ? "取込中…" : "📄 来店記録CSVで回数券を取込"}
      </button>
      {msg && (
        <span className="help" style={{ margin: 0, color: msg.ok ? "#3d6b4f" : "#9a3a30" }}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
