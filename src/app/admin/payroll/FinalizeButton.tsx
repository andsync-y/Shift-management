"use client";

import { useState } from "react";
import { applyFcMonthly, fcSnapshotState, requestFcSync } from "./actions";

// FCの当月実績（指名数・回数券本数＝新規＋更新）を取込んで給与を確定（再計算）するボタン。
//
// 保存済みスナップショットに回数券販売数が無い場合は、その場で本部スクレイパ
// （GitHub Actions）を起動し、取得が入るのを待ってから取り込み直す。
// アプリから本部システムへ直接は繋げないため「起動して待つ」形になる。

const POLL_MS = 6000;
const POLL_MAX = 30; // 6秒 × 30 = 最大3分

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function FinalizeButton({ month }: { month: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setMsg(null);
    setBusy("取込中…");
    try {
      const first = await applyFcMonthly(month);
      if (!first.kaisukenMissing) {
        setMsg({ ok: first.ok, text: first.message });
        return;
      }

      // 回数券が未取得 → 本部から取りに行く
      setBusy("本部から取得を開始中…");
      const before = await fcSnapshotState(month);
      const kicked = await requestFcSync();
      if (!kicked.ok) {
        setMsg({ ok: false, text: `${first.message}${kicked.message}` });
        return;
      }

      for (let i = 0; i < POLL_MAX; i++) {
        await sleep(POLL_MS);
        setBusy(`本部から取得中… ${Math.round(((i + 1) * POLL_MS) / 1000)}秒（最大3分）`);
        const now = await fcSnapshotState(month);
        // 更新時刻が動いた＝新しい取得が入った。回数券が入っていれば取り込む。
        if (now.updatedAt && now.updatedAt !== before.updatedAt) {
          if (!now.hasTicketSales) {
            setMsg({
              ok: false,
              text: "本部からの取得は終わりましたが、担当別の回数券販売数を読み取れませんでした（ダッシュボードの列名が想定と違う可能性があります）。「📄 来店記録CSVで回数券を取込」で入れてください。",
            });
            return;
          }
          setBusy("取込中…");
          const second = await applyFcMonthly(month);
          setMsg({ ok: second.ok, text: second.message });
          return;
        }
      }
      setMsg({
        ok: false,
        text: "本部からの取得が3分以内に終わりませんでした。しばらくしてからもう一度お試しいただくか、「📄 来店記録CSVで回数券を取込」をお使いください。",
      });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "取込に失敗しました。" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn-fill"
        style={{ fontSize: 12.5, padding: "7px 14px" }}
        disabled={busy != null}
        onClick={run}
      >
        {busy ?? "FC実績を取込んで給与確定"}
      </button>
      {msg && (
        <span className="help" style={{ margin: 0, color: msg.ok ? "#3d6b4f" : "#9a3a30" }}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
