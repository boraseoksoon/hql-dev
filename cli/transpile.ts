import { transpileFile, writeOutput } from "../src/transpiler/transpiler.ts";

/**
 * Simple logger.
 */
function log(message: string) {
  console.log(message);
}

/**
 * Transpile an HQL file and write the output to a file.
 *
 * @param inputPath - Path to the input HQL file.
 * @param outputPath - Path to the output JavaScript file.
 */
async function transpileCLI(inputPath: string, outputPath?: string): Promise<void> {
  try {
    log(`Transpiling ${inputPath}...`);
    const code = await transpileFile(inputPath);
    const outPath = outputPath ?? inputPath.replace(/\.hql$/, '.js');
    await writeOutput(code, outPath);
    log(`Successfully transpiled ${inputPath} -> ${outPath}`);
  } catch (error: any) {
    console.error(`Transpilation failed: ${error.message}`);
    Deno.exit(1);
  }
}

/**
 * Watch an HQL file for changes and transpile on modification.
 *
 * @param inputPath - Path to the input HQL file.
 */
async function watchFile(inputPath: string): Promise<void> {
  log(`Watching ${inputPath} for changes...`);
  
  try {
    // Initial transpilation
    await transpileCLI(inputPath);
    
    // Set up file watcher
    const watcher = Deno.watchFs(inputPath);
    
    for await (const event of watcher) {
      if (event.kind === 'modify') {
        try {
          log(`File changed, retranspiling...`);
          await transpileCLI(inputPath);
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

// Command-line execution when run directly
if (import.meta.main) {
  const args = Deno.args;
  
  if (args.length < 1) {
    console.error("Usage: deno run -A compile.ts <input.hql> [output.js] [--watch]");
    Deno.exit(1);
  }
  
  const inputPath = args[0];
  let outputPath: string | undefined = undefined;
  let watch = false;
  
  // Check if the second argument is an output path (does not start with '--')
  if (args.length > 1 && !args[1].startsWith('--')) {
    outputPath = args[1];
  }
  
  // Check for watch flag
  if (args.includes('--watch')) {
    watch = true;
  }
  
  if (watch) {
    watchFile(inputPath).catch(() => Deno.exit(1));
  } else {
    transpileCLI(inputPath, outputPath).catch(() => Deno.exit(1));
  }
}

export default transpileCLI;
