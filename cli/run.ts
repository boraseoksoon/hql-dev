// cli/run.ts
import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI } from "../src/bundler.ts";
import { Logger } from "../src/logger.ts";

async function runModule(): Promise<void> {
  const args = Deno.args.filter((arg) => !arg.startsWith("--"));
  const verbose = Deno.args.includes("--verbose");
  const logger = new Logger(verbose);

  if (args.length < 1) {
    console.error("Usage: deno run -A cli/run.ts <target.hql|target.js> [--verbose]");
    Deno.exit(1);
  }

  const inputPath = resolve(args[0]);
  logger.log(`Processing entry: ${inputPath}`);

  // If the user hasn't specified an output file (for run.ts we expect none),
  // then generate a temporary output file so that we don't risk deleting any user files.
  const tempOutput = Deno.makeTempFileSync({ suffix: ".js" });
  
  // Use transpileCLI to create the bundled output.
  const bundledPath = await transpileCLI(inputPath, tempOutput, { verbose });
  logger.log(`Running bundled output: ${bundledPath}`);

  // Dynamically import the bundled module.
  await import("file://" + resolve(bundledPath));

  // Since we generated a temporary file, remove it after running.
  await Deno.remove(bundledPath);
  logger.log(`Removed temporary bundled file: ${bundledPath}`);
}

if (import.meta.main) {
  runModule().catch((error) => {
    console.error("Error:", error);
    Deno.exit(1);
  });
}
