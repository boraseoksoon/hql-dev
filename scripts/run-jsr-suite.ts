// deno run -A scripts/run-jsr-suite.ts
// Runs the HQL doc/examples suite using the published JSR package (network-enabled)

import * as path from "jsr:@std/path@1";

const VERSION = Deno.env.get("HQL_VERSION") ?? "7.8.6";
const root = Deno.cwd();

// Import the JSR package
const pkg = await import(`jsr:@boraseoksoon/hql@${VERSION}`);
// Verify the resolved package version matches what we asked for
const resolvedVersion: string | undefined = (pkg as any).version || ((pkg as any).default?.version);
if (resolvedVersion && resolvedVersion !== VERSION) {
  console.error(`Requested JSR version ${VERSION}, but resolved ${resolvedVersion}.`);
  Deno.exit(1);
}

// Run simple files via runFile (resolves relative imports)
const runFile: (p: string, opts?: any) => Promise<any> = pkg.runFile ?? (async (p: string) => {
  const src = await Deno.readTextFile(p);
  const baseDir = path.dirname(p);
  return await pkg.run(src, { baseDir, currentFile: p });
});

// Bundler for compile+run cases (complex graphs, TS/JS interop)
let transpileCLI: undefined | ((inputPath: string, outputPath?: string, opts?: { verbose?: boolean; showTiming?: boolean; force?: boolean }) => Promise<string>);
try {
  const bundler = await import(`jsr:@boraseoksoon/hql@${VERSION}/bundler`);
  transpileCLI = bundler.transpileCLI as typeof transpileCLI;
} catch (_e) {
  transpileCLI = undefined;
}

function abs(rel: string): string {
  return path.isAbsolute(rel) ? rel : path.resolve(root, rel);
}

const filesRun = [
  "doc/examples/array+type.hql",
  "doc/examples/class.hql",
  "doc/examples/fn.hql",
  "doc/examples/fn+enum.hql",
  "doc/examples/binding.hql",
  "doc/examples/take.hql",
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
  "doc/examples/dependency-test/macro-a.hql",
  "doc/examples/dependency-test2/a.hql",
  // Import tests (JS/TS interop & hyphen names)
  "doc/examples/import-test/base.hql",
  "doc/examples/import-test/export-lib.hql",
  "doc/examples/import-test/export-test.hql",
  "doc/examples/import-test/hyphen-test.hql",
];

const filesCompileRun = [
  "doc/examples/test-complex-imports/extreme-test-simple/entry.hql",
  "doc/examples/test-complex-imports/circular/a.hql",
  "doc/examples/ts-import-test/entry2.hql",
  // Treat direct-js-import.hql as a compile+run case to resolve relative JS via bundler
  "doc/examples/import-test/direct-js-import.hql",
];

let passed = 0, failed = 0;

console.log(`=== Running HQL JSR Suite (v${VERSION}) ===\n`);

for (const rel of filesRun) {
  const p = abs(rel);
  try {
    await runFile(p);
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
    if (!transpileCLI) throw new Error("bundler not available in JSR package");
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
