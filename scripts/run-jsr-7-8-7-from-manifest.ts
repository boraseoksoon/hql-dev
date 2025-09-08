// deno run -A scripts/run-jsr-7-8-7-from-manifest.ts tests/manifest-official.json
// Static ESM JSR runner for a manifest (supports globs via std/fs)

import * as path from "jsr:@std/path@1";
import { expandGlob } from "jsr:@std/fs@1/expand-glob";
import {
  runFile as runFileHql,
  version as HQL_VERSION
} from "jsr:@boraseoksoon/hql@7.8.10";
import { transpileCLI } from "jsr:@boraseoksoon/hql@7.8.10/bundler";

if (HQL_VERSION !== "7.8.10") {
  console.error(`Expected jsr:@boraseoksoon/hql@7.8.10 but resolved ${HQL_VERSION}`);
  Deno.exit(1);
}

const root = Deno.cwd();
const manifestPath = Deno.args[0] || "tests/manifest-official.json";
const manifest: string[] = JSON.parse(await Deno.readTextFile(path.resolve(root, manifestPath)));

async function expandEntries(entries: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.includes("*")) {
      for await (const file of expandGlob(entry)) {
        if (file.isFile && file.path.endsWith(".hql")) out.push(path.resolve(root, file.path));
      }
    } else {
      out.push(path.resolve(root, entry));
    }
  }
  return out.sort();
}

let passed = 0, failed = 0;
console.log(`=== HQL JSR Suite v${HQL_VERSION} — manifest: ${manifestPath} ===\n`);

const files = await expandEntries(manifest);
for (const file of files) {
  const rel = path.relative(root, file);
  try {
    // Try simple run first (runtime HTTP/jsr/npm)
    await runFileHql(file);
    console.log("OK ", rel);
    passed++;
  } catch (_e) {
    // Fallback to compile+run
    try {
      const out = await transpileCLI(file);
      await import("file://" + out);
      console.log("OK ", rel);
      passed++;
    } catch (e2) {
      console.error("FAIL", rel, ":", e2?.message || e2);
      failed++;
    }
  }
}

console.log(`\nResults: ${passed}/${passed + failed} passed`);
// Force exit whether tests pass or fail
Deno.exit(failed ? 1 : 0);
