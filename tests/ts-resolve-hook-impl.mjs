// 拡張子なしの相対import と "@/..." エイリアスを .ts へ解決するローダー実装。
// （tests/ts-resolve-hook.mjs から register される）

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const srcRoot = path.join(projectRoot, "src");

function withTsExtension(filePath) {
  if (existsSync(filePath)) return filePath;
  for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
    if (existsSync(filePath + ext)) return filePath + ext;
  }
  const indexTs = path.join(filePath, "index.ts");
  if (existsSync(indexTs)) return indexTs;
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // "@/lib/payroll" → <project>/src/lib/payroll.ts
  if (specifier.startsWith("@/")) {
    const resolved = withTsExtension(path.join(srcRoot, specifier.slice(2)));
    if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
  }

  // "./tax-table-r8" のような拡張子なし相対import
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const resolved = withTsExtension(path.resolve(parentDir, specifier));
    if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
