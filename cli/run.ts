// cli/run.ts - Improved version with better logging and error handling

import { resolve, extname } from "jsr:@std/path@1.0.8";
import transpileCLI from "./transpile.ts";

/**
 * Import and run a JavaScript module
 * @param filePath Path to the JavaScript file to run
 */
async function runModule(filePath: string): Promise<void> {
  try {
    console.log(`\n▶️ Executing module: "${filePath}"`);
    await import("file://" + filePath);
    console.log(`\n✅ Module execution completed successfully`);
  } catch (error) {
    console.error(`\n❌ Module execution failed: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(`\nStack trace:\n${error.stack}`);
    }
    Deno.exit(1);
  }
}

/**
 * Display help information
 */
function showHelp(): void {
  console.log(`
HQL Runner - Run HQL and JavaScript files

USAGE:
  deno run --allow-read --allow-write run.ts <target.hql|target.js> [options]

OPTIONS:
  --bundle        Bundle the output into a self-contained JavaScript file
  --verbose       Enable verbose logging
  --format=esm    Use ESM module format (default)
  --format=commonjs  Use CommonJS module format
  --help          Show this help message

EXAMPLES:
  deno run --allow-read --allow-write run.ts app.hql
  deno run --allow-read --allow-write run.ts app.hql --bundle --verbose
  deno run --allow-read --allow-write run.ts app.js
`);
}

async function main() {
  const args = Deno.args;
  
  // Parse command line arguments
  let bundle = false;
  let verbose = false;
  let format: "esm" | "commonjs" = "esm";
  let showHelpFlag = false;
  let target: string | undefined;
  
  // Process all arguments
  for (const arg of args) {
    if (arg === '--bundle') bundle = true;
    else if (arg === '--verbose') verbose = true;
    else if (arg === '--format=commonjs') format = "commonjs";
    else if (arg === '--help' || arg === '-h') showHelpFlag = true;
    else if (!arg.startsWith('--') && !target) target = arg;
  }
  
  // Show help if requested or if no target file is provided
  if (showHelpFlag || !target) {
    showHelp();
    Deno.exit(showHelpFlag ? 0 : 1);
  }
  
  // Print execution info
  console.log("\n✨ HQL Runner ✨");
  console.log(`\nRunning with options:
  Target: "${target}"
  Bundle: ${bundle ? 'enabled' : 'disabled'}
  Format: ${format}
  Verbose: ${verbose ? 'enabled' : 'disabled'}`);
  
  try {
    const targetPath = resolve(target);
    const ext = extname(targetPath);
    let modulePath = targetPath;

    // If HQL file, transpile to JS first
    if (ext === ".hql") {
      if (bundle) {
        console.log("\n🔄 Bundle mode enabled - transpiling to a self-contained JavaScript file");
      }
      
      console.log(`\n🔨 Transpiling HQL file: "${targetPath}"`);
      await transpileCLI(targetPath, undefined, { bundle, verbose, module: format });
      modulePath = targetPath.replace(/\.hql$/, ".js");
      console.log(`\n✅ Transpilation complete: "${modulePath}"`);
    } else if (ext !== ".js") {
      console.error(`\n❌ Unsupported file type: "${ext}". Please provide a .hql or .js file.`);
      Deno.exit(1);
    }
    
    // Run the module
    await runModule(modulePath);
  } catch (error) {
    console.error(`\n❌ Error running module: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(`\nStack trace:\n${error.stack}`);
    }
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main().catch(error => {
    console.error(`\n❌ Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(`\nStack trace:\n${error.stack}`);
    }
    Deno.exit(1);
  });
}