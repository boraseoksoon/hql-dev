// run.ts - Updated to run the finalized JavaScript code

import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { processHql } from "../src/s-exp/main.ts";
import { Logger } from "../src/logger.ts";

async function run(): Promise<void> {
  const args = Deno.args;
  if (args.length < 1) {
    console.error("Usage: deno run -A run.ts <input.hql> [--verbose]");
    Deno.exit(1);
  }
  
  const inputPath = resolve(args[0]);
  const verbose = args.includes("--verbose");
  const logger = new Logger(verbose);
  
  try {
    // Read the HQL source from the given file.
    const source = await Deno.readTextFile(inputPath);
    
    // Process the HQL source through the new S-expression front end.
    // This function parses, expands macros, connects to the legacy AST,
    // and passes the result into the existing pipeline to produce JS code.
    const jsCode = await processHql(source, { 
      verbose, 
      baseDir: Deno.cwd() 
    });
    
    // Write the transpiled JavaScript to a temporary file.
    const tempFilePath = await Deno.makeTempFile({ suffix: ".js" });
    await Deno.writeTextFile(tempFilePath, jsCode);
    await import(tempFilePath);
    
  } catch (error) {
    logger.error(`Error processing file: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  run();
}
