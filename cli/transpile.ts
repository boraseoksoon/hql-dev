import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI, watchFile, OptimizationOptions } from "../src/bundler.ts";
import { MODES } from "./modes.ts";

function printHelp() {
  console.error("Usage: deno run -A cli/transpile.ts <input.hql|input.js> [output.js] [options]");
  console.error("\nBasic Options:");
  console.error("  --run             Run the compiled output");
  console.error("  --watch           Watch for changes and recompile");
  console.error("  --verbose, -v     Enable verbose logging");
  console.error("  --force, -f       Overwrite output files without prompting");
  console.error("  --performance     Apply all performance optimizations");
  console.error("  --print           Print final JS output directly in CLI");
  console.error("  --help, -h        Display this help message");
  console.error("\nOptimization Options:");
  console.error("  --mode=<mode>     Use a preset mode (development, production, performance)");
  console.error("  --minify, -m      Minify the output code");
  console.error("  --target=<target> Set target environment (es2015, es2020, esnext, etc.)");
  console.error("  --sourcemap=<type> Generate sourcemaps (true, false, inline, external)");
  console.error("  --drop=<items>    Remove specific code (comma-separated: console,debugger)");
  console.error("  --charset=<type>  Character set (ascii, utf8)");
  console.error("  --legal-comments=<type> How to handle comments (none, inline, eof, external)");
  console.error("  --tree-shaking    Enable tree shaking (true, false)");
  console.error("  --keep-names      Preserve original function and class names");
  console.error("\nExamples:");
  console.error("  deno run -A cli/transpile.ts input.hql --mode=production");
  console.error("  deno run -A cli/transpile.ts input.hql output.js --performance");
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
  let watch = false;
  let verbose = false;
  let runAfter = false;
  let force = false;
  let performance = false;
  const printOutput = args.includes("--print");
  
  // Optimization options
  let optimizationOptions: OptimizationOptions = {};

  // Parse options
  if (args.length > 1 && !args[1].startsWith("--")) {
    outputPath = args[1];
  }
  
  for (const arg of args) {
    // Parse basic options
    if (arg === "--watch") watch = true;
    if (arg === "--verbose" || arg === "-v") verbose = true;
    if (arg === "--run") runAfter = true;
    if (arg === "--force" || arg === "-f") force = true;
    if (arg === "--performance") performance = true;
    
    // Parse optimization options
    if (arg === "--minify" || arg === "-m") optimizationOptions.minify = true;
    if (arg === "--keep-names") optimizationOptions.keepNames = true;
    if (arg === "--tree-shaking") optimizationOptions.treeShaking = true;
    
    // Parse options with values
    if (arg.startsWith("--mode=")) {
      const mode = arg.substring(7);
      if (MODES[mode]) {
        optimizationOptions = { ...optimizationOptions, ...MODES[mode] };
      } else {
        console.error(`Unknown mode: ${mode}`);
        printHelp();
        Deno.exit(1);
      }
    }
    
    if (arg.startsWith("--target=")) optimizationOptions.target = arg.substring(9);
    
    if (arg.startsWith("--sourcemap=")) {
      const value = arg.substring(12);
      optimizationOptions.sourcemap = value === "true" ? true : 
                                    value === "false" ? false : value;
    }
    
    if (arg.startsWith("--drop=")) {
      optimizationOptions.drop = arg.substring(7).split(",");
    }
    
    if (arg.startsWith("--charset=")) {
      const value = arg.substring(10);
      optimizationOptions.charset = (value === "ascii" || value === "utf8") ? 
                                  value as any : undefined;
    }
    
    if (arg.startsWith("--legal-comments=")) {
      const value = arg.substring(17);
      optimizationOptions.legalComments = (value === "none" || value === "inline" || 
                                        value === "eof" || value === "external") ?
                                        value as any : undefined;
    }
    
    if (arg.startsWith("--pure=")) {
      optimizationOptions.pure = arg.substring(7).split(",");
    }
    
    if (arg.startsWith("--define=")) {
      try {
        const defineStr = arg.substring(9);
        const parts = defineStr.split('=');
        if (parts.length === 2) {
          if (!optimizationOptions.define) optimizationOptions.define = {};
          optimizationOptions.define[parts[0]] = parts[1];
        }
      } catch (e) {
        console.error(`Invalid define format. Use --define=key=value`);
      }
    }
  }
  
  // Apply performance optimizations if flag is set
  if (performance) {
    optimizationOptions = { ...optimizationOptions, ...MODES.performance };
  }
  
  // Log enabled optimization options
  if (verbose) {
    Deno.env.set("HQL_DEBUG", "1");
    console.log("Verbose logging enabled");
    
    // Log active optimization options
    const activeOptions = Object.entries(optimizationOptions)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
    
    if (activeOptions.length > 0) {
      console.log("Active optimization options:");
      activeOptions.forEach(opt => console.log(`  ${opt}`));
    }
  }

  if (watch) {
    watchFile(inputPath, { verbose, force, ...optimizationOptions }).catch(() => Deno.exit(1));
  } else {
    transpileCLI(inputPath, outputPath, { 
      verbose, 
      force, 
      ...optimizationOptions 
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
}

if (import.meta.main) {
  runCLI();
}
