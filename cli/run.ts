import { resolve, extname } from "https://deno.land/std@0.170.0/path/mod.ts";
import transpileCLI from "./transpile.ts";

async function runModule(filePath: string): Promise<void> {
  await import("file://" + filePath);
}

async function main() {
  const [target] = Deno.args;
  if (!target) {
    console.error("Usage: deno run --allow-read --allow-write run.ts <target.hql|target.js>");
    Deno.exit(1);
  }
  
  const targetPath = resolve(target);
  const ext = extname(targetPath);
  let modulePath = targetPath;

  if (ext === ".hql") {
    await transpileCLI(targetPath);
    modulePath = targetPath.replace(/\.hql$/, ".js");
    console.log(`Running transpiled file: ${modulePath}`);
  } else if (ext !== ".js") {
    console.error("Unsupported file type. Please provide a .hql or .js file.");
    Deno.exit(1);
  }
  
  await runModule(modulePath);
}

if (import.meta.main) {
  main();
}
