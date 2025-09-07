// deno run -A scripts/run-jsr-suite-7-8-6.ts
// Static ESM imports of the published package (no dynamic specifiers)

import * as path from "jsr:@std/path@1";
import {
  run as runHql,
  runFile as runFileHql,
  transpile as transpileHql,
  version as HQL_VERSION
} from "jsr:@boraseoksoon/hql@7.8.6";
import { transpileCLI } from "jsr:@boraseoksoon/hql@7.8.6/bundler";

if (HQL_VERSION !== "7.8.6") {
  console.error(`Expected jsr:@boraseoksoon/hql@7.8.6 but resolved ${HQL_VERSION}`);
  Deno.exit(1);
}

const root = Deno.cwd();

function abs(rel: string): string {
  return path.isAbsolute(rel) ? rel : path.resolve(root, rel);
}

const filesRun: string[] = [
  "doc/examples/array+type.hql",
  "doc/examples/class.hql",
  "doc/examples/fn.hql",
  "doc/examples/fn+enum.hql",
  "doc/examples/binding.hql",
  "doc/examples/cond.hql",
  "doc/examples/loop.hql",
  "doc/examples/fx.hql",
  "doc/examples/fx+loop.hql",
  "doc/examples/fx+fn.hql",
  "doc/examples/return.hql",
  "doc/examples/traditional-method-chain-invocation.hql",
  "doc/examples/dot-access-method-chain-invocation.hql",
  "doc/examples/hql-dot-notation-showcase.hql",
  "doc/examples/macro.hql",
  "doc/specs/hql_spec.hql",
  // Imports (network-enabled)
  "doc/examples/import.hql",
  "doc/examples/macro-import-default-module.hql",
  "doc/examples/macro-import-name-space.hql",
  // Keep HTTP/JSR imports in simple run; complex local graphs go to compileRun
];

const filesCompileRun: string[] = [
  "doc/examples/take.hql",
  "doc/examples/dependency-test/macro-a.hql",
  "doc/examples/dependency-test2/a.hql",
  "doc/examples/import-test/base.hql",
  "doc/examples/import-test/export-lib.hql",
  "doc/examples/import-test/export-test.hql",
  "doc/examples/import-test/hyphen-test.hql",
  "doc/examples/ts-import-test/entry2.hql",
  "doc/examples/test-complex-imports/extreme-test-simple/entry.hql",
  "doc/examples/test-complex-imports/circular/a.hql",
  "doc/examples/import-test/direct-js-import.hql",
];

let passed = 0, failed = 0;

console.log(`=== Running HQL JSR Suite (v${HQL_VERSION}) ===\n`);

for (const rel of filesRun) {
  const p = abs(rel);
  try {
    if (typeof runFileHql === "function") {
      await runFileHql(p);
    } else {
      const src = await Deno.readTextFile(p);
      const baseDir = path.dirname(p);
      await runHql(src, { baseDir, currentFile: p });
    }
    console.log(`OK  ${rel}`);
    passed++;
  } catch (e) {
    console.error(`FAIL ${rel}: ${e?.message || e}`);
    failed++;
  }
}

for (const rel of filesCompileRun) {
  const p = abs(rel);
  try {
    const outPath = await transpileCLI(p, undefined, { verbose: false, showTiming: false });
    await import("file://" + outPath);
    console.log(`OK  ${rel}`);
    passed++;
  } catch (e) {
    console.error(`FAIL ${rel}: ${e?.message || e}`);
    failed++;
  }
}

console.log(`\nResults: ${passed}/${passed + failed} passed`);
if (failed) Deno.exit(1);
