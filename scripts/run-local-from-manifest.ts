// deno run -A scripts/run-local-from-manifest.ts tests/manifest-official.json
// Local CLI runner for a manifest (supports globs via std/fs)

import * as path from "jsr:@std/path@1";
import { expandGlob } from "jsr:@std/fs@1/expand-glob";

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
console.log(`=== LOCAL HQL Suite — manifest: ${manifestPath} ===\n`);

const files = await expandEntries(manifest);
for (const file of files) {
  const rel = path.relative(root, file);
  console.log("START", rel);
  try {
    const cmd = new Deno.Command("deno", {
      args: ["run", "-A", path.resolve(root, "core/cli/run.ts"), file],
      stdout: "inherit",
      stderr: "inherit",
    });
    const child = cmd.spawn();
    const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 60_000));
    let status;
    try {
      status = await Promise.race([child.status, timer]);
    } catch (e) {
      try { child.kill(); } catch {}
      console.error("FAIL", rel, ":", e?.message || e);
      failed++;
      continue;
    }
    if (status.success) {
      console.log("OK ", rel);
      passed++;
    } else {
      console.error("FAIL", rel, ": exit code", status.code);
      failed++;
    }
  } catch (e) {
    console.error("FAIL", rel, ":", e?.message || e);
    failed++;
  }
}

console.log(`\nResults: ${passed}/${passed + failed} passed`);
// Force exit whether tests pass or fail
Deno.exit(failed ? 1 : 0);
