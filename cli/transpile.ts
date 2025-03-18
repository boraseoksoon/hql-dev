import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI } from "../src/bundler.ts";

function printHelp() {
  console.error("Usage: deno run -A cli/transpile.ts <input.hql|input.js> [output.js] [options]");
  console.error("\nBasic Options:");
  console.error("  --run             Run the compiled output");
  console.error("  --verbose, -v     Enable verbose logging");
  console.error("  --force, -f       Overwrite output files without prompting");
  console.error("  --print           Print final JS output directly in CLI");
  console.error("  --help, -h        Display this help message");
  console.error("\nExamples:");
  console.error("  deno run -A cli/transpile.ts input.hql");
  console.error("  deno run -A cli/transpile.ts input.hql output.js");
}

function runCLI(): void {
  const args = Deno.args;
  if (args.length < 1 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    Deno.exit(1);
  }

  const inputPath = args[0];
  let outputPath: string | undefined = undefined;
  
  // Basic options
  let verbose = false;
  let runAfter = false;
  let force = false;
  const printOutput = args.includes("--print");
  
  // Parse options
  if (args.length > 1 && !args[1].startsWith("--")) {
    outputPath = args[1];
  }
  
  for (const arg of args) {
    // Parse basic options
    if (arg === "--verbose" || arg === "-v") verbose = true;
    if (arg === "--run") runAfter = true;
    if (arg === "--force" || arg === "-f") force = true;
  }
  
  if (verbose) {
    Deno.env.set("HQL_DEBUG", "1");
    console.log("Verbose logging enabled");
  }

  transpileCLI(inputPath, outputPath, { 
    verbose, 
    force
  })
    .then(async (bundledPath) => {
      if (printOutput) {
        // Read and print the bundled file content to stdout.
        const finalOutput = await Deno.readTextFile(bundledPath);
        console.log(finalOutput);
      } else if (runAfter) {
        console.log(`Running bundled output: ${bundledPath}`);
        await import("file://" + resolve(bundledPath));
      }
    })
    .catch((error) => {
      console.error("Error during transpilation:", error.message || error);
      Deno.exit(1);
    });
}

if (import.meta.main) {
  runCLI();
}
