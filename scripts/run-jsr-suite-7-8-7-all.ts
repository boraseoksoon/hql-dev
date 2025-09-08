// deno run -A scripts/run-jsr-suite-7-8-7-all.ts
// Static ESM runner that discovers all *.hql files under doc/examples
// and executes them using jsr:@boraseoksoon/hql@7.8.7.

import * as path from "jsr:@std/path@1";
import { runFile, version as HQL_VERSION } from "jsr:@boraseoksoon/hql@7.8.9";
import { transpileCLI } from "jsr:@boraseoksoon/hql@7.8.9/bundler";

if (HQL_VERSION !== "7.8.9") {
  console.error(`Expected jsr:@boraseoksoon/hql@7.8.9 but resolved ${HQL_VERSION}`);
  Deno.exit(1);
}

const root = Deno.cwd();
const examplesDir = path.resolve(root, "doc/examples");

async function listHqlFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    for await (const entry of Deno.readDir(d)) {
      const p = path.resolve(d, entry.name);
      if (entry.isDirectory) {
        // Skip build/cache dirs if any
        if (entry.name === ".build" || entry.name === ".hql-cache") continue;
        await walk(p);
      } else if (entry.isFile && p.endsWith(".hql")) {
        out.push(p);
      }
    }
  }
  await walk(dir);
  return out.sort();
}

let passed = 0, failed = 0;
console.log(`=== HQL JSR Full Suite (examples) v${HQL_VERSION} ===\n`);

const files = await listHqlFiles(examplesDir);
for (const file of files) {
  const rel = path.relative(root, file);
  try {
    // Try simple runFile first (runtime HTTP/jsr/npm allowed). The package runtime may fallback to bundler as needed.
    await runFile(file);
    console.log("OK ", rel);
    passed++;
  } catch (_e) {
    // Fallback: compile+run via bundler
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
if (failed) Deno.exit(1);
