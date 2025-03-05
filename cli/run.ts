// cli/run.ts
import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { loadStandardLibrary } from "../lib/loader.ts";
import { transpile } from "../src/transpiler/transformer.ts";

async function main() {
  const args = Deno.args;
  if (args.length < 1) {
    console.error("Usage: deno run -A cli/run.ts <target.hql>");
    Deno.exit(1);
  }
  
  const target = args[0];
  const targetPath = resolve(target);
  console.log(`Transpiling HQL file: "${targetPath}"`);

  const preludeSource = await loadStandardLibrary();
  const userSource = await Deno.readTextFile(targetPath);
  const combinedSource = preludeSource + "\n" + userSource;
  
  // Transpile the combined source.
  const transpiled = await transpile(combinedSource, targetPath, {
    bundle: false,
    verbose: false,
    module: "esm"
  });
  
  // Write the output file.
  const outputPath = targetPath.replace(/\.hql$/, ".js");
  await Deno.writeTextFile(outputPath, transpiled);
  console.log(`Successfully transpiled "${targetPath}" -> "${outputPath}"`);
  
  // Execute the generated module.
  console.log(`Executing module: "${outputPath}"`);
  await import("file://" + outputPath);
}

if (import.meta.main) {
  main().catch(error => {
    console.error("Error:", error);
    Deno.exit(1);
  });
}
