// cli/transpile.ts - ESM-only version

import { dirname, resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { parse } from "../src/transpiler/parser.ts";
import { transformAST } from "../src/transpiler/transformer.ts";

// A conditional log function that only prints when verbose logging is enabled
function log(message: string) {
  if (Deno.env.get("HQL_DEBUG") === "1") {
    console.log(message);
  }
}

export async function transpileCLI(
  inputPath: string, 
  outputPath?: string, 
  options: { 
    bundle?: boolean; 
    verbose?: boolean;
  } = {}
): Promise<void> {
  try {
    log(`Transpiling ${inputPath}...`);
    
    // Resolve the input path
    const resolvedInputPath = resolve(inputPath);
    log(`Resolved input path: ${resolvedInputPath}`);
    
    // Determine output path
    const outPath = outputPath ?? resolvedInputPath.replace(/\.hql$/, '.js');
    log(`Output path: ${outPath}`);
    
    const userSource = await Deno.readTextFile(resolvedInputPath);
    
    // Parse the HQL source
    const ast = parse(userSource);
    
    // Transform with macro expansion enabled
    const dir = dirname(resolvedInputPath);
    const transformed = await transformAST(ast, dir, {
      bundle: options.bundle,
      verbose: options.verbose
    });
    
    await writeOutput(transformed, outPath);
    log(`Successfully transpiled ${inputPath} -> ${outPath}`);
  } catch (error: any) {
    console.error(`Transpilation failed: ${error.message}`);
    throw error;
  }
}

async function writeOutput(code: string, outputPath: string): Promise<void> {
  try {
    const outputDir = dirname(outputPath);
    try {
      await Deno.mkdir(outputDir, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }
    await Deno.writeTextFile(outputPath, code);
    log(`Output written to: ${outputPath}`);
  } catch (error: any) {
    throw new Error(`Failed to write output: ${error.message}`);
  }
}

async function watchFile(
  inputPath: string, 
  options: { 
    bundle?: boolean; 
    verbose?: boolean;
  } = {}
): Promise<void> {
  log(`Watching ${inputPath} for changes...`);
  
  try {
    // Initial transpilation
    await transpileCLI(inputPath, undefined, options);
    
    // Watch for changes
    const watcher = Deno.watchFs(inputPath);
    for await (const event of watcher) {
      if (event.kind === 'modify') {
        try {
          log(`File changed, retranspiling...`);
          await transpileCLI(inputPath, undefined, options);
        } catch (error: any) {
          console.error(`Transpilation failed: ${error.message}`);
        }
      }
    }
  } catch (error: any) {
    console.error(`Watch error: ${error.message}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  const args = Deno.args;
  if (args.length < 1) {
    console.error("Usage: deno run -A cli/transpile.ts <input.hql> [output.js] [--watch] [--bundle] [--verbose]");
    Deno.exit(1);
  }
  
  const inputPath = args[0];
  let outputPath: string | undefined = undefined;
  let watch = false;
  let bundle = false;
  let verbose = false;
  
  if (args.length > 1 && !args[1].startsWith('--')) {
    outputPath = args[1];
  }
  
  for (const arg of args) {
    if (arg === '--watch') watch = true;
    if (arg === '--bundle') bundle = true;
    if (arg === '--verbose') verbose = true;
  }
  
  // Set the environment flag for verbose logging
  if (verbose) {
    Deno.env.set("HQL_DEBUG", "1");
    console.log("Verbose logging enabled");
  }
  
  if (bundle) {
    console.log("Bundle mode enabled - output will be a self-contained JavaScript file");
  }
  
  if (watch) {
    watchFile(inputPath, { bundle, verbose }).catch(() => Deno.exit(1));
  } else {
    transpileCLI(inputPath, outputPath, { bundle, verbose }).catch(() => Deno.exit(1));
  }
}