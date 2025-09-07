// deno run -A scripts/run-local-examples-all.ts
// Runs every .hql file under doc/examples using the LOCAL HQL CLI

import * as path from "jsr:@std/path@1";

const root = Deno.cwd();
const examplesDir = path.resolve(root, "doc/examples");

async function listHqlFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    for await (const entry of Deno.readDir(d)) {
      const p = path.resolve(d, entry.name);
      if (entry.isDirectory) {
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
console.log("=== LOCAL HQL Full Examples Suite ===\n");

const files = await listHqlFiles(examplesDir);
for (const file of files) {
  const rel = path.relative(root, file);
  try {
    const cmd = new Deno.Command("deno", {
      args: ["run", "-A", path.resolve(root, "core/cli/run.ts"), file],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout, stderr } = await cmd.output();
    const outStr = new TextDecoder().decode(stdout);
    const errStr = new TextDecoder().decode(stderr);
    if (code === 0) {
      console.log("OK ", rel);
      if (outStr.trim().length) console.log(outStr.trim());
      passed++;
    } else {
      console.error("FAIL", rel);
      if (outStr.trim().length) console.log(outStr.trim());
      if (errStr.trim().length) console.error(errStr.trim());
      failed++;
    }
  } catch (e) {
    console.error("FAIL", file, ":", e?.message || e);
    failed++;
  }
}

console.log(`\nResults: ${passed}/${passed + failed} passed`);
if (failed) Deno.exit(1);

