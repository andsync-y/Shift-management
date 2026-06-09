// =====================================================================
// セサミ5（CANDY HOUSE）スマートロック Web API ラッパ
// =====================================================================
// 公式LINEから店舗入口の施錠/解錠を行うための薄いラッパ。
// すべて環境変数でキーを受け取り、未設定なら「無効」として静かに no-op する
// （LINE連携と同じ段階移行設計。キー未設定の環境でも既存機能は壊れない）。
//
// 必要な環境変数:
//   SESAME_API_KEY      … CANDY HOUSE で発行する Web API キー
//   SESAME_DEVICE_UUID  … セサミ5のデバイスUUID
//   SESAME_SECRET_KEY   … デバイスの secret key（16バイト=32桁の16進）
//
// 前提: セサミ5に Wi-Fiモジュール2 / Hub3 をペアリングし、
//       アプリの「設定 → 連携 → API」を ON にしておくこと。
//       （Bluetoothのみの本体単体ではクラウド経由の操作は不可）
// =====================================================================

import crypto from "crypto";

const CMD_URL = (uuid: string) => `https://app.candyhouse.co/api/sesame2/${uuid}/cmd`;
const STATUS_URL = (uuid: string) => `https://app.candyhouse.co/api/sesame2/${uuid}`;

// SesameOS3 のコマンド番号
const CMD_LOCK = 82;
const CMD_UNLOCK = 83;

export function isSesameEnabled(): boolean {
  return Boolean(
    process.env.SESAME_API_KEY && process.env.SESAME_DEVICE_UUID && process.env.SESAME_SECRET_KEY
  );
}

// ---------------------------------------------------------------------
// 署名 (AES-CMAC / RFC 4493, AES-128)
// ---------------------------------------------------------------------
// セサミは「現在時刻(Unix秒)の上位3バイト」を secret key で AES-CMAC した値を
// 署名として要求する。Node には CMAC が無いため RFC 4493 を自前実装する。

function xor(a: Buffer, b: Buffer): Buffer {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
}

function leftShift(buf: Buffer): Buffer {
  const out = Buffer.alloc(buf.length);
  let overflow = 0;
  for (let i = buf.length - 1; i >= 0; i--) {
    out[i] = ((buf[i] << 1) & 0xff) | overflow;
    overflow = buf[i] & 0x80 ? 1 : 0;
  }
  return out;
}

function aesCmac(key: Buffer, message: Buffer): Buffer {
  const blockSize = 16;
  const Rb = 0x87;
  const zero = Buffer.alloc(blockSize, 0);

  const encryptBlock = (block: Buffer): Buffer => {
    const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(block), cipher.final()]);
  };

  // サブキー生成
  const L = encryptBlock(zero);
  const K1 = leftShift(L);
  if (L[0] & 0x80) K1[K1.length - 1] ^= Rb;
  const K2 = leftShift(K1);
  if (K1[0] & 0x80) K2[K2.length - 1] ^= Rb;

  const n = Math.ceil(message.length / blockSize) || 1;
  const lastComplete = message.length > 0 && message.length % blockSize === 0;

  let lastBlock: Buffer;
  if (lastComplete) {
    lastBlock = xor(message.subarray((n - 1) * blockSize, n * blockSize), K1);
  } else {
    const rem = message.subarray((n - 1) * blockSize);
    const padded = Buffer.alloc(blockSize, 0);
    rem.copy(padded);
    padded[rem.length] = 0x80;
    lastBlock = xor(padded, K2);
  }

  let x: Buffer = zero;
  for (let i = 0; i < n - 1; i++) {
    x = encryptBlock(xor(x, message.subarray(i * blockSize, (i + 1) * blockSize)));
  }
  return encryptBlock(xor(x, lastBlock));
}

// 署名を生成（Unix秒のLE4バイトから最下位1バイトを落とした上位3バイトを署名対象にする）
function sesameSign(secretHex: string): string {
  const t = Math.floor(Date.now() / 1000);
  const buf = Buffer.allocUnsafe(4);
  buf.writeUInt32LE(t);
  const message = buf.subarray(1, 4);
  return aesCmac(Buffer.from(secretHex, "hex"), message).toString("hex");
}

// ---------------------------------------------------------------------
// 施錠 / 解錠
// ---------------------------------------------------------------------

async function sendCmd(cmd: number, operatorName: string): Promise<boolean> {
  if (!isSesameEnabled()) return false;
  const uuid = process.env.SESAME_DEVICE_UUID!;
  const secret = process.env.SESAME_SECRET_KEY!;
  const apiKey = process.env.SESAME_API_KEY!;
  try {
    const res = await fetch(CMD_URL(uuid), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        cmd,
        // history は操作者名。アプリの履歴に「誰が操作したか」として残る（base64）。
        history: Buffer.from(operatorName).toString("base64"),
        sign: sesameSign(secret),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// 施錠。成功で true。operatorName は操作履歴に残る表示名。
export async function sesameLock(operatorName: string): Promise<boolean> {
  return sendCmd(CMD_LOCK, operatorName);
}

// 解錠（開場）。成功で true。
export async function sesameUnlock(operatorName: string): Promise<boolean> {
  return sendCmd(CMD_UNLOCK, operatorName);
}

// 現在の施錠状態を取得（"locked" / "unlocked" / null）。
export async function sesameStatus(): Promise<"locked" | "unlocked" | null> {
  if (!isSesameEnabled()) return null;
  const uuid = process.env.SESAME_DEVICE_UUID!;
  const apiKey = process.env.SESAME_API_KEY!;
  try {
    const res = await fetch(STATUS_URL(uuid), { headers: { "x-api-key": apiKey } });
    if (!res.ok) return null;
    const data = (await res.json()) as { CHSesame2Status?: string };
    if (data.CHSesame2Status === "locked") return "locked";
    if (data.CHSesame2Status === "unlocked") return "unlocked";
    return null;
  } catch {
    return null;
  }
}
