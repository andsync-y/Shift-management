// =====================================================================
// テスト実行用のモジュール解決フック
// =====================================================================
// Next.js/TypeScript のソースは拡張子なしの相対import（"./tax-table-r8"）と
// パスエイリアス（"@/lib/xxx"）を使うが、Node の ESM ローダーはそれを解決しない。
// テストから本番コードをそのまま読めるよう、この2つを解決する。
//   node --experimental-strip-types --import ./tests/ts-resolve-hook.mjs --test tests/*.test.ts
// =====================================================================

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-resolve-hook-impl.mjs", pathToFileURL("./tests/"));
