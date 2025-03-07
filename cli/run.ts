// cli/run.ts
import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpile } from "../src/transpiler/transformer.ts";

async function main() {
  // Filter out flags from the target path argument.
  const args = Deno.args.filter(arg => !arg.startsWith("--"));
  const verbose = Deno.args.includes("--verbose");

  if (args.length < 1) {
    console.error("Usage: deno run -A cli/run.ts <target.hql> [--verbose]");
    Deno.exit(1);
  }
  
  const target = args[0];
  const targetPath = resolve(target);
  if (verbose) {
    console.log(`Transpiling HQL file: "${targetPath}"`);
  }

  const userSource = await Deno.readTextFile(targetPath);
  const combinedSource = userSource;
  
  // Pass the verbose flag to your transpile function.
  const transpiled = await transpile(combinedSource, targetPath, {
    bundle: false,
    verbose,  // now dynamic
    module: "esm"
  });
  
  // Write the output file.
  const outputPath = targetPath.replace(/\.hql$/, ".js");
  await Deno.writeTextFile(outputPath, transpiled);
  if (verbose) {
    console.log(`Successfully transpiled "${targetPath}" -> "${outputPath}"`);
    console.log(`Executing module: "${outputPath}"`);
  }
  
  // Execute the generated module.
  await import("file://" + outputPath);
}

if (import.meta.main) {
  main().catch(error => {
    console.error("Error:", error);
    Deno.exit(1);
  });
}
