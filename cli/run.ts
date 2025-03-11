import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpile } from "../src/transpiler/transformer.ts";

async function main() {
  // Filter out flags from the target path argument
  const args = Deno.args.filter(arg => !arg.startsWith("--"));
  const verbose = Deno.args.includes("--verbose");
  // Force bundle mode to inline all imports, preventing extra file generation
  const bundle = true;

  if (args.length < 1) {
    console.error("Usage: deno run -A cli/run.ts <target.hql> [--verbose]");
    Deno.exit(1);
  }
  
  const target = args[0];
  const targetPath = resolve(target);
  if (verbose) {
    console.log(`Transpiling HQL file: "${targetPath}" with bundling enabled`);
  }

  const userSource = await Deno.readTextFile(targetPath);
  
  // Transpile with bundling enabled so that all dependent HQL modules are inlined
  const transpiled = await transpile(userSource, targetPath, {
    bundle,
    verbose, 
    module: "esm"
  });
  
  if (verbose) {
    console.log(`Successfully transpiled "${targetPath}". Executing module inline.`);
  }
  
  // Compute the base directory as a file URL.
  const targetDir = new URL('.', `file://${targetPath.replace(/\\/g, "/")}`).href;
  
  // Rewrite relative import paths to absolute URLs.
  const fixedTranspiled = transpiled.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_, prefix, rel, suffix) => {
    try {
      const abs = new URL(rel, targetDir).href;
      return prefix + abs + suffix;
    } catch (error) {
      return prefix + rel + suffix;
    }
  });
  
  // Append a sourceURL comment for easier debugging.
  const sourceWithURL = fixedTranspiled + `\n//# sourceURL=file://${targetPath.replace(/\\/g, "/")}.js`;
  
  // Create a Blob URL for the transpiled code and dynamically import it.
  const blob = new Blob([sourceWithURL], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    await import(url);
  } catch (error) {
    console.error("Error executing module:", error);
  } finally {
    URL.revokeObjectURL(url);
  }
}

if (import.meta.main) {
  main().catch(error => {
    console.error("Error:", error);
    Deno.exit(1);
  });
}
