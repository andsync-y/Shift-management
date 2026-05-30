// =====================================================================
// ホットペッパービューティー「サロンボード」連携インターフェース（将来用）
// =====================================================================
// サロンボードには公開 API が無いため、実運用ではブラウザ自動操作(RPA, 例: Playwright)
// で確定シフトを入力する想定。ここでは差し替え可能な抽象レイヤーのみ定義する。
//
// 現状は NoopSalonBoardClient（何もしない実装）を提供。
// 実装時は SalonBoardClient を満たすクラスを作り、環境変数の認証情報で初期化する。
// =====================================================================

import type { Profile, Shift } from "@/lib/types";

export interface SalonBoardClient {
  /** 確定シフトをサロンボードへ反映する */
  pushShifts(shifts: Shift[]): Promise<SalonBoardPushResult>;
}

export interface SalonBoardPushResult {
  ok: boolean;
  pushed: number;
  failed: number;
  message: string;
}

// 現状の既定実装（未連携）。
export class NoopSalonBoardClient implements SalonBoardClient {
  async pushShifts(shifts: Shift[]): Promise<SalonBoardPushResult> {
    return {
      ok: false,
      pushed: 0,
      failed: shifts.length,
      message:
        "サロンボード連携は未実装です。ブラウザ自動操作(RPA)による反映は今後のフェーズで対応予定です。現状は確定シフトを画面/CSVから手動入力してください。",
    };
  }
}

// 認証情報(環境変数)が揃っていれば Playwright 連携クライアント、無ければ Noop を返す。
export async function getSalonBoardClient(
  staff: Profile[] = []
): Promise<SalonBoardClient> {
  const { loadConfigFromEnv, PlaywrightSalonBoardClient } = await import(
    "./playwright-client"
  );
  const config = loadConfigFromEnv();
  if (config) {
    return new PlaywrightSalonBoardClient(config, staff);
  }
  return new NoopSalonBoardClient();
}
