import { resolve, dirname } from "https://deno.land/std@0.170.0/path/mod.ts";
import { processHql } from "../src/s-exp/main.ts";
import { Logger } from "../src/logger.ts";

async function run(): Promise<void> {
  const args = Deno.args;
  if (args.length < 1) {
    console.error("Usage: deno run -A run.ts <input.hql> [--verbose]");
    Deno.exit(1);
  }
  
  const inputPath = resolve(args[0]);
  const inputDir = dirname(inputPath); // Get the directory of the input file
  const verbose = args.includes("--verbose");
  const logger = new Logger(verbose);
  
  try {
    // Read the HQL source from the given file.
    const source = await Deno.readTextFile(inputPath);
    
    // Process the HQL source through the new S-expression front end.
    let jsCode = await processHql(source, { 
      verbose, 
      baseDir: inputDir  // Use input file's directory as base, not cwd()
    });

    // Fix relative imports to use absolute paths
    jsCode = fixImportPaths(jsCode, inputDir);

    if (verbose) {
      logger.log("*****************")
      logger.log("*****************")
      logger.log("*****************")
      logger.log("*****************")
      logger.log(jsCode)
      logger.log("*****************")
      logger.log("*****************")
      logger.log("*****************")
      logger.log("*****************")
    }
    
    // Write the transpiled JavaScript to a temporary file.
    const tempFilePath = await Deno.makeTempFile({ suffix: ".js" });
    await Deno.writeTextFile(tempFilePath, jsCode);
    await import(tempFilePath);
    
  } catch (error) {
    logger.error(`Error processing file: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

/**
 * Fix relative import paths in generated JavaScript code to use absolute paths.
 * This ensures imports work when executed from a temporary location.
 */
function fixImportPaths(code: string, baseDir: string): string {
  return code.replace(
    /import\s+(?:\*\s+as\s+\w+|{\s*[\w\s,]+\s*}|\w+)\s+from\s+["'](\.[^"']+)["']/g,
    (match, relPath) => {
      const absPath = resolve(baseDir, relPath);
      return match.replace(relPath, absPath);
    }
  );
}

if (import.meta.main) {
  run();
}