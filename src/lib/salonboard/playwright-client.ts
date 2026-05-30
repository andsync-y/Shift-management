// =====================================================================
// サロンボード連携 (Playwright によるブラウザ自動操作 / RPA)
// =====================================================================
// ⚠️ 重要な注意:
//  - サロンボードには公開 API が無いため、確定シフトの反映は画面操作の自動化で行う。
//  - 自店舗の正規アカウントでの利用を前提とする。サロンボードの利用規約・画面変更・
//    2段階認証(SMS/メール認証)の有無によって動作しなくなる可能性がある。
//  - DOM セレクタはサロンボードの実画面に合わせて要調整。既定値は環境変数で上書き可能。
//  - playwright は optionalDependencies。未インストール時は実行時に明示エラーを返す。
// =====================================================================

import type { Shift, Profile } from "@/lib/types";
import type { SalonBoardClient, SalonBoardPushResult } from "./index";

export interface PlaywrightSalonBoardConfig {
  loginId: string;
  password: string;
  loginUrl: string;
  // 画面変更に追従できるよう主要セレクタは設定で上書き可能にする
  selectors: {
    loginIdInput: string;
    passwordInput: string;
    loginButton: string;
    // ログイン成功の目印になる要素
    loggedInMarker: string;
  };
  headless: boolean;
  // 1スタッフ1シフトを入力する処理。実画面の構造に依存するため差し替え可能にする。
  // 既定実装はログインの成否までを担保し、入力部分は要件に応じて実装する。
}

const DEFAULTS = {
  loginUrl: "https://salonboard.com/login/",
  selectors: {
    loginIdInput: 'input[name="userId"]',
    passwordInput: 'input[name="password"]',
    loginButton: 'a.common-CNCcommon__primaryBtn, button[type="submit"]',
    loggedInMarker: 'text=ログアウト',
  },
};

export function loadConfigFromEnv(): PlaywrightSalonBoardConfig | null {
  const loginId = process.env.SALONBOARD_LOGIN_ID;
  const password = process.env.SALONBOARD_PASSWORD;
  if (!loginId || !password) return null;

  return {
    loginId,
    password,
    loginUrl: process.env.SALONBOARD_LOGIN_URL ?? DEFAULTS.loginUrl,
    selectors: {
      loginIdInput: process.env.SALONBOARD_SEL_ID ?? DEFAULTS.selectors.loginIdInput,
      passwordInput: process.env.SALONBOARD_SEL_PW ?? DEFAULTS.selectors.passwordInput,
      loginButton: process.env.SALONBOARD_SEL_LOGIN_BTN ?? DEFAULTS.selectors.loginButton,
      loggedInMarker:
        process.env.SALONBOARD_SEL_LOGGEDIN ?? DEFAULTS.selectors.loggedInMarker,
    },
    headless: process.env.SALONBOARD_HEADLESS !== "false",
  };
}

export class PlaywrightSalonBoardClient implements SalonBoardClient {
  constructor(
    private config: PlaywrightSalonBoardConfig,
    private staff: Profile[]
  ) {}

  async pushShifts(shifts: Shift[]): Promise<SalonBoardPushResult> {
    // playwright は optional。未インストールなら分かりやすいエラーを返す。
    let chromium: typeof import("playwright").chromium;
    try {
      ({ chromium } = await import("playwright"));
    } catch {
      return {
        ok: false,
        pushed: 0,
        failed: shifts.length,
        message:
          "playwright が未インストールです。`npm install playwright && npx playwright install chromium` を実行してください。",
      };
    }

    const staffMap = new Map(this.staff.map((s) => [s.id, s]));
    const browser = await chromium.launch({ headless: this.config.headless });
    let pushed = 0;
    let failed = 0;
    const errors: string[] = [];

    try {
      const context = await browser.newContext();
      const page = await context.newPage();

      // 1) ログイン
      await page.goto(this.config.loginUrl, { waitUntil: "domcontentloaded" });
      await page.fill(this.config.selectors.loginIdInput, this.config.loginId);
      await page.fill(this.config.selectors.passwordInput, this.config.password);
      await page.click(this.config.selectors.loginButton);

      // ログイン後の目印を待つ。2段階認証が挟まる環境では失敗するため timeout を返す。
      try {
        await page.waitForSelector(this.config.selectors.loggedInMarker, {
          timeout: 15000,
        });
      } catch {
        return {
          ok: false,
          pushed: 0,
          failed: shifts.length,
          message:
            "ログインに失敗しました。認証情報、または2段階認証(SMS/メール)の有無を確認してください。",
        };
      }

      // 2) シフトを1件ずつ入力
      //    ⚠️ ここから先はサロンボードのシフト登録画面の構造に強く依存する。
      //    実画面に合わせて inputOneShift を実装すること。現状は安全のため未対応として扱う。
      for (const shift of shifts) {
        const staff = staffMap.get(shift.staff_id);
        try {
          await this.inputOneShift(page, shift, staff?.full_name ?? "");
          pushed++;
        } catch (e) {
          failed++;
          errors.push(
            `${shift.work_date} ${staff?.full_name ?? shift.staff_id}: ${
              e instanceof Error ? e.message : String(e)
            }`
          );
        }
      }
    } finally {
      await browser.close();
    }

    const ok = failed === 0 && pushed > 0;
    return {
      ok,
      pushed,
      failed,
      message: ok
        ? `${pushed} 件のシフトをサロンボードへ反映しました。`
        : `反映: ${pushed}件 / 失敗: ${failed}件。${errors.slice(0, 5).join(" / ")}`,
    };
  }

  // サロンボードのシフト登録画面に1件入力する。
  // ⚠️ 実画面の DOM が公開されていないため、ここは導入時に実装・検証が必要。
  private async inputOneShift(
    _page: import("playwright").Page,
    _shift: Shift,
    _staffName: string
  ): Promise<void> {
    throw new Error(
      "シフト入力処理が未実装です。サロンボードのシフト登録画面に合わせて inputOneShift を実装してください。"
    );
  }
}
