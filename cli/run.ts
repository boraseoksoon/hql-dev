// cli/run.ts - Updated with bundling support

import { resolve, extname } from "https://deno.land/std@0.170.0/path/mod.ts";
import transpileCLI from "./transpile.ts";

async function runModule(filePath: string): Promise<void> {
  await import("file://" + filePath);
}

async function main() {
  const args = Deno.args;
  let bundle = false;
  let verbose = false;
  
  // Parse all arguments to extract flags and the target file
  const flags = args.filter(arg => arg.startsWith('--'));
  const nonFlags = args.filter(arg => !arg.startsWith('--'));
  
  // Check for bundle and verbose flags
  bundle = flags.includes('--bundle');
  verbose = flags.includes('--verbose');
  
  // Get the target file (first non-flag argument)
  const target = nonFlags[0];
  
  if (!target) {
    console.error("Usage: deno run --allow-read --allow-write run.ts <target.hql|target.js> [--bundle] [--verbose]");
    Deno.exit(1);
  }
  
  const targetPath = resolve(target);
  const ext = extname(targetPath);
  let modulePath = targetPath;

  if (ext === ".hql") {
    if (bundle) {
      console.log("Bundle mode enabled - transpiling to a self-contained JavaScript file");
    }
    
    await transpileCLI(targetPath, undefined, { bundle, verbose });
    modulePath = targetPath.replace(/\.hql$/, ".js");
    console.log(`Running transpiled file: ${modulePath}`);
  } else if (ext !== ".js") {
    console.error("Unsupported file type. Please provide a .hql or .js file.");
    Deno.exit(1);
  }
  
  await runModule(modulePath);
}

if (import.meta.main) {
  main().catch(error => {
    console.error("Error running module:", error);
    Deno.exit(1);
  });
}