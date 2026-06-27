"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ShiftCalendarView from "@/components/ShiftCalendarView";
import type { Profile, Shift, TimeOffRequest } from "@/lib/types";

// タブレット（受付）用の打刻キオスク。
// 名前ボタンをタップ → 出勤時のみ、その瞬間だけカメラを起動して1枚撮り即停止（オンデマンド）。
// 撮影中だけ右上にプレビューを出す。顔認証（照合）はしない。常時カメラONにしない＝電池/privacy配慮。
// ?token=<KIOSK_TOKEN> で保護。初回URLのtokenを端末に保存する。

type StaffState = {
  id: string;
  name: string;
  color: string;
  shifts: string;
  open: boolean;
  inAt: string | null;
  outAt: string | null;
};

export default function KioskPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffState[]>([]);
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // 打刻中のstaffId
  const [capturing, setCapturing] = useState(false); // 撮影中（プレビュー表示）
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [clock, setClock] = useState("");
  const [cal, setCal] = useState<{
    year: number;
    month: number;
    shifts: Shift[];
    staff: Profile[];
    timeOff: TimeOffRequest[];
  } | null>(null);

  // token を URL から取得し、以降は localStorage に保持
  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("token");
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("kiosk_token") : null;
    const t = q || stored;
    if (q) {
      localStorage.setItem("kiosk_token", q);
      url.searchParams.delete("token");
      window.history.replaceState({}, "", url.toString());
    }
    setToken(t);
  }, []);

  // 時計
  useEffect(() => {
    const tick = () => {
      const j = new Date(Date.now() + 9 * 3600 * 1000);
      const p = (n: number) => String(n).padStart(2, "0");
      setClock(`${p(j.getUTCHours())}:${p(j.getUTCMinutes())}:${p(j.getUTCSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // カメラ停止＋プレビューを消す（保留中のタイマーも掃除）。
  const stopCamera = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCapturing(false);
  }, []);

  // 出勤の瞬間だけカメラ起動 → 右上にプレビュー → 1枚撮影。撮影後もプレビューを約3秒残してから停止。
  // 撮影自体は速く返すので打刻送信は待たせない（プレビューだけ後から消える）。失敗時 undefined。
  const captureOnce = useCallback(async (): Promise<string | undefined> => {
    stopCamera(); // 前回の残りを掃除
    let dataUrl: string | undefined;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) {
        stopCamera();
        return undefined;
      }
      v.srcObject = stream;
      setCapturing(true);
      await v.play().catch(() => {});
      await new Promise<void>((res) => {
        if (v.readyState >= 2 && v.videoWidth) return res();
        v.onloadeddata = () => res();
        setTimeout(res, 1200);
      });
      await new Promise((r) => setTimeout(r, 350)); // 露出が安定するまで少し待つ
      if (v.videoWidth) {
        const W = 480;
        const H = Math.round((v.videoHeight / v.videoWidth) * W) || 360;
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0, W, H);
          dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        }
      }
    } catch {
      stopCamera();
      return undefined;
    }
    // 撮影後もプレビューを約3秒残してからカメラを止める
    hideTimer.current = setTimeout(stopCamera, 3000);
    return dataUrl;
  }, [stopCamera]);

  // 画面離脱時はカメラを確実に止める
  useEffect(() => stopCamera, [stopCamera]);

  const load = useCallback(async (t: string) => {
    try {
      const r = await fetch(`/api/kiosk/today?token=${encodeURIComponent(t)}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) {
        setError(j.error === "unauthorized" ? "このタブレットの認証が無効です。設定用URLを開き直してください。" : j.error);
        return;
      }
      setError(null);
      setStaff(j.staff);
      setDate(j.date);
    } catch {
      setError("通信に失敗しました。ネットワークを確認してください。");
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    load(token);
    const id = setInterval(() => load(token), 60000); // 1分ごとに再取得
    return () => clearInterval(id);
  }, [token, load]);

  // 下部のシフトカレンダー（当月）。打刻ほど頻繁でなくてよいので10分ごと。
  const loadCal = useCallback(async (t: string) => {
    try {
      const r = await fetch(`/api/kiosk/shifts?token=${encodeURIComponent(t)}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) setCal({ year: j.year, month: j.month, shifts: j.shifts, staff: j.staff, timeOff: j.timeOff });
    } catch {
      /* カレンダーは補助表示なので失敗は無視 */
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    loadCal(token);
    const id = setInterval(() => loadCal(token), 600000);
    return () => clearInterval(id);
  }, [token, loadCal]);

  const punch = useCallback(
    async (s: StaffState) => {
      if (!token || busy) return;
      setBusy(s.id);
      const action = s.open ? "out" : "in";
      const photo = action === "in" ? await captureOnce() : undefined; // 写真は出勤時のみ・撮ったら即カメラOFF
      try {
        const r = await fetch("/api/kiosk/punch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, staffId: s.id, action, photo }),
        });
        const j = await r.json();
        setToast({ ok: !!j.ok, text: j.message ?? (j.ok ? "記録しました" : "失敗しました") });
        if (j.ok) await load(token);
      } catch {
        setToast({ ok: false, text: "通信に失敗しました。もう一度押してください。" });
      } finally {
        setBusy(null);
        setTimeout(() => setToast(null), 3500);
      }
    },
    [token, busy, captureOnce, load]
  );

  return (
    <div className="kiosk">
      <header className="kiosk-head">
        <div>
          <div className="kiosk-store">全力ストレッチ岐阜長良店</div>
          <div className="kiosk-date">{date && `${date.slice(5).replace("-", "/")} の出勤予定`}</div>
        </div>
        <div className="kiosk-right">
          <video
            ref={videoRef}
            className="kiosk-cam"
            muted
            playsInline
            style={{ display: capturing ? "block" : "none" }}
          />
          <a href="/kiosk/print" className="kiosk-print-btn">🖨 シフト表を印刷</a>
          <div className="kiosk-clock en">{clock}</div>
        </div>
      </header>

      {error ? (
        <div className="kiosk-empty">{error}</div>
      ) : staff.length === 0 ? (
        <div className="kiosk-empty">本日の出勤予定はありません。</div>
      ) : (
        <div className="kiosk-grid">
          {staff.map((s) => (
            <button
              key={s.id}
              className={"kiosk-card" + (s.open ? " open" : "")}
              disabled={busy === s.id}
              onClick={() => punch(s)}
            >
              <span className="kc-dot" style={{ background: s.color }} />
              <span className="kc-name">{s.name}</span>
              <span className="kc-shift">{s.shifts}</span>
              <span className="kc-action">
                {busy === s.id ? (s.open ? "記録中…" : "📷 記録中…") : s.open ? "退勤する" : "出勤する"}
              </span>
              <span className="kc-state">
                {s.open ? `出勤 ${s.inAt} 〜` : s.outAt ? `退勤済 ${s.outAt}` : "未出勤"}
              </span>
            </button>
          ))}
        </div>
      )}

      {cal && (
        <div className="kiosk-cal">
          <div className="kiosk-cal-title">
            {cal.year}年{cal.month}月 のシフト
          </div>
          <ShiftCalendarView
            year={cal.year}
            month={cal.month}
            shifts={cal.shifts}
            staff={cal.staff}
            timeOff={cal.timeOff}
          />
        </div>
      )}

      {toast && (
        <div className={"kiosk-toast" + (toast.ok ? " ok" : " ng")} onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
