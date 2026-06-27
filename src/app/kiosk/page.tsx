"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// タブレット（受付）用の打刻キオスク。
// 名前ボタンをタップ → その瞬間の前面カメラ映像を1枚キャプチャ（低解像度）→ 出勤/退勤を記録。
// 顔認証（照合）はしない＝即時。?token=<KIOSK_TOKEN> で保護。初回URLのtokenを端末に保存する。

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
  const streamReady = useRef(false);
  const [token, setToken] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffState[]>([]);
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // 打刻中のstaffId
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [clock, setClock] = useState("");
  const [camOn, setCamOn] = useState(false);
  const [camErr, setCamErr] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

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

  // カメラ起動（プレビュー）。失敗しても打刻は写真なしで通す。
  const startCamera = useCallback(async () => {
    setCamErr(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      streamReady.current = true;
      setCamOn(true);
    } catch {
      streamReady.current = false;
      setCamOn(false);
      setCamErr(true);
    }
  }, []);

  // 画面表示時に一度自動起動を試みる（ブロック時はボタンで再試行）
  useEffect(() => {
    startCamera();
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [startCamera]);

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

  // 現在のカメラ映像を低解像度JPEGで1枚取得
  const capture = useCallback((): string | undefined => {
    const v = videoRef.current;
    if (!v || !streamReady.current || !v.videoWidth) return undefined;
    const W = 480;
    const H = Math.round((v.videoHeight / v.videoWidth) * W) || 360;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(v, 0, 0, W, H);
    return canvas.toDataURL("image/jpeg", 0.7);
  }, []);

  const punch = useCallback(
    async (s: StaffState) => {
      if (!token || busy) return;
      setBusy(s.id);
      const action = s.open ? "out" : "in";
      const photo = action === "in" ? capture() : undefined; // 写真は出勤時のみ
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
    [token, busy, capture, load]
  );

  return (
    <div className="kiosk">
      <header className="kiosk-head">
        <div>
          <div className="kiosk-store">全力ストレッチ岐阜長良店</div>
          <div className="kiosk-date">{date && `${date.slice(5).replace("-", "/")} の出勤予定`}</div>
        </div>
        <div className="kiosk-right">
          <video ref={videoRef} className={"kiosk-cam" + (camOn ? "" : " off")} muted playsInline />
          <div className="kiosk-clock en">{clock}</div>
        </div>
      </header>

      {!camOn && (
        <div className="kiosk-note">
          <span>
            {camErr
              ? "カメラがブロックされています。画面の色フィルター（ブルーライト軽減/読書灯/夜間モード）をオフにして、下のボタンを押してください。※写真なしでも打刻はできます。"
              : "カメラ起動中… 写真なしでも打刻はできます。"}
          </span>
          <button type="button" className="btn-outline" style={{ fontSize: 13 }} onClick={startCamera}>
            カメラを有効にする
          </button>
        </div>
      )}

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
                {busy === s.id ? "記録中…" : s.open ? "退勤する" : "出勤する"}
              </span>
              <span className="kc-state">
                {s.open ? `出勤 ${s.inAt} 〜` : s.outAt ? `退勤済 ${s.outAt}` : "未出勤"}
              </span>
            </button>
          ))}
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
