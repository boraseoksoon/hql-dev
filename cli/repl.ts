// cli/repl.ts
import { startRepl } from "../src/repl/index.ts";
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";

/**
 * Main REPL command-line entry point
 */
export async function main(args: string[]): Promise<number> {
  try {
    // Parse command-line arguments
    const flags = parseFlags(args);
    
    // Start the REPL with the parsed options
    await startRepl({
      verbose: flags.verbose,
      showAst: flags.ast,
      showExpanded: flags.expanded,
      showJs: flags.js,
      baseDir: flags.baseDir || Deno.cwd(),
    });
    
    return 0;
  } catch (error) {
    console.error("Failed to start REPL:");
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    return 1;
  }
}

/**
 * Parse command-line flags
 */
function parseFlags(args: string[]): {
  verbose: boolean;
  ast: boolean;
  expanded: boolean;
  js: boolean;
  baseDir?: string;
} {
  const flags = {
    verbose: false,
    ast: false,
    expanded: false,
    js: false,
    baseDir: undefined as string | undefined,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case "--verbose":
      case "-v":
        flags.verbose = true;
        break;
        
      case "--ast":
        flags.ast = true;
        break;
        
      case "--expanded":
        flags.expanded = true;
        break;
        
      case "--js":
        flags.js = true;
        break;
        
      case "--dir":
      case "-d":
        if (i + 1 < args.length) {
          flags.baseDir = path.resolve(args[++i]);
        }
        break;
    }
  }
  
  return flags;
}

// Run if invoked directly
if (import.meta.main) {
  const exitCode = await main(Deno.args);
  Deno.exit(exitCode);
}