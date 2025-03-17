// run.ts - Updated to use new S-expression front end

import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { processHql } from "../src/s-exp/main.ts";
import { Logger } from "../src/logger.ts";

// Simple help message function
function printHelp(): void {
  console.error("Usage: deno run -A run.ts <input.hql> [--verbose]");
  Deno.exit(1);
}

async function run(): Promise<void> {
  const args = Deno.args;
  if (args.length < 1) {
    printHelp();
  }
  
  const inputPath = resolve(args[0]);
  const verbose = args.includes("--verbose");
  const logger = new Logger(verbose);
  
  try {
    // Read the HQL source from the given file.
    const source = await Deno.readTextFile(inputPath);
    
    // Process the HQL source through the new S-expression front end.
    // This function parses, expands macros, connects to the legacy AST,
    // and then passes the result into the existing pipeline to produce JS code.
    const jsCode = await processHql(source, { 
      verbose, 
      baseDir: Deno.cwd() 
    });
    
    // Output the final JavaScript code
    console.log(jsCode);
    
  } catch (error) {
    logger.error(`Error processing file: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  run();
}
