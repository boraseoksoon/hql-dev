// src/repl/repl.ts
// Main entry point for the REPL - exports the startRepl function and other components

import { startRepl } from "./repl-core.ts";
export { startRepl };

if (import.meta.main) {
  startRepl();
}

