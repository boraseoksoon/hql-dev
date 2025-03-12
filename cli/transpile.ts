// cli/transpile.ts
import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI, watchFile } from "../src/bundler.ts";

function runCLI(): void {
  const args = Deno.args;
  if (args.length < 1 || args.includes("--help")) {
    console.error(
      "Usage: deno run -A cli/transpile.ts <input.hql|input.js> [output.js] [--run] [--watch] [--verbose]"
    );
    Deno.exit(1);
  }

  const inputPath = args[0];
  let outputPath: string | undefined = undefined;
  let watch = false;
  let verbose = false;
  let runAfter = false;

  if (args.length > 1 && !args[1].startsWith("--")) {
    outputPath = args[1];
  }
  for (const arg of args) {
    if (arg === "--watch") watch = true;
    if (arg === "--verbose") verbose = true;
    if (arg === "--run") runAfter = true;
  }
  if (verbose) {
    Deno.env.set("HQL_DEBUG", "1");
    console.log("Verbose logging enabled");
  }

  if (watch) {
    watchFile(inputPath, { verbose }).catch(() => Deno.exit(1));
  } else {
    transpileCLI(inputPath, outputPath, { verbose })
      .then(async (bundledPath) => {
        if (runAfter) {
          console.log(`Running bundled output: ${bundledPath}`);
          await import("file://" + resolve(bundledPath));
        }
      })
      .catch(() => Deno.exit(1));
  }
}

if (import.meta.main) {
  runCLI();
}
