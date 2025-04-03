// src/repl/index.ts
export { StatefulRepl, startRepl } from "./repl.ts";

// Allow direct execution as a script
if (import.meta.main) {
  const { startRepl } = await import("./repl.ts");
  
  await startRepl({
    verbose: Deno.args.includes("--verbose") || Deno.args.includes("-v"),
    showAst: Deno.args.includes("--ast"),
    showExpanded: Deno.args.includes("--expanded"),
    showJs: Deno.args.includes("--js"),
  }).catch(console.error);
}