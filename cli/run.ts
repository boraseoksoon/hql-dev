// run.ts
import { resolve, extname } from "https://deno.land/std@0.170.0/path/mod.ts";
import { processFile, createBundle } from "../src/bundleHQL.ts";

/**
 * Bundles an HQL file and its dependencies, writes the resulting JavaScript
 * to a temporary file, and then imports that file.
 */
async function runHQL(targetPath: string): Promise<void> {
  const tempFile = await Deno.makeTempFile({ suffix: ".js" });
  const modules = await processFile(targetPath);
  const bundle = createBundle(modules);
  await Deno.writeTextFile(tempFile, bundle);
  await import("file://" + tempFile);
}

/**
 * Directly runs a JavaScript file.
 */
async function runJS(targetPath: string): Promise<void> {
  await import("file://" + resolve(targetPath));
}

/**
 * Entry point: accepts a target file (.hql or .js) and runs it.
 */
async function main() {
  const [target] = Deno.args;
  if (!target) {
    console.error("Usage: deno run --allow-read run.ts <target.hql|target.js>");
    Deno.exit(1);
  }
  const targetPath = resolve(target);
  const ext = extname(targetPath);
  if (ext === ".hql") {
    await runHQL(targetPath);
  } else if (ext === ".js") {
    await runJS(targetPath);
  } else {
    console.error("Unsupported file type. Please provide a .hql or .js file.");
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
