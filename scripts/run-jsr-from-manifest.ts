// deno run -A scripts/run-jsr-from-manifest.ts tests/manifest-official.json
// Static ESM JSR runner for a manifest (supports globs via std/fs)
// Uses the latest published version from JSR

import * as path from "jsr:@std/path@1";
import { expandGlob } from "jsr:@std/fs@1/expand-glob";
// Use version 7.8.17 from JSR
import {
  runFile as runFileHql,
  version as HQL_VERSION
} from "jsr:@boraseoksoon/hql@7.8.17";
import { transpileCLI } from "jsr:@boraseoksoon/hql@7.8.17/bundler";

// Just log the version being used
console.log(`Using jsr:@boraseoksoon/hql version ${HQL_VERSION}`);

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
console.log(`=== HQL JSR Suite (v${HQL_VERSION}) — manifest: ${manifestPath} ===\n`);

const files = await expandEntries(manifest);
for (const file of files) {
  const rel = path.relative(root, file);
  // Prefer bundling/transpiling first to avoid any runtime-side
  // diagnostics being printed on failure (noise in CI output).
  try {
    const out = await transpileCLI(file);
    await import("file://" + out);
    console.log("OK ", rel);
    passed++;
    continue;
  } catch (_bundlerErr) {
    // If bundling fails (e.g. unsupported import), fall back to direct run.
  }

  try {
    await runFileHql(file);
    console.log("OK ", rel);
    passed++;
  } catch (e2) {
    console.error("FAIL", rel, ":", e2?.message || e2);
    failed++;
  }
}

console.log(`\nResults: ${passed}/${passed + failed} passed`);
// Force exit whether tests pass or fail
Deno.exit(failed ? 1 : 0);
