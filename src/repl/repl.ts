// src/repl/repl.ts
// Main entry point for the REPL - exports the startRepl function and other components

import { startRepl, ReplOptions } from "./repl-core.ts";

if (import.meta.main) {
  const args = Deno.args;
  
  const options: ReplOptions = {
    verbose: args.includes("-v") || args.includes("--verbose"),
    showAst: args.includes("--ast"),
    showExpanded: args.includes("--expanded"),
    showJs: args.includes("--js"),
    useColors: !args.includes("--no-colors"),
    enableCompletion: !args.includes("--no-completion"),
  };
  
  // Check for init file
  const initFileIndex = args.indexOf("--init");
  if (initFileIndex >= 0 && initFileIndex < args.length - 1) {
    options.initialFile = args[initFileIndex + 1];
  }
  
  // Check for base directory
  const dirIndex = args.indexOf("--dir");
  if (dirIndex >= 0 && dirIndex < args.length - 1) {
    options.baseDir = args[dirIndex + 1];
  }
  
  // Start the REPL
  startRepl(options);
}

export { startRepl };