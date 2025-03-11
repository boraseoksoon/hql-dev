import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpile } from "../src/transpiler/transformer.ts";

/**
 * Recursively inlines HQL imports found in the given code.
 *
 * It searches for import statements that end with ".hql", and for each one:
 *  - Computes the absolute file path using the given baseDir.
 *  - Reads and transpiles that HQL file (using bundling).
 *  - Recursively inlines any HQL imports in that module.
 *  - Creates a Blob URL for the transpiled code.
 *  - Replaces the import specifier with that Blob URL.
 *
 * @param code The code to process.
 * @param baseDir The base directory as a file URL string.
 * @param verbose Whether to log verbose output.
 * @param cache A cache to avoid reprocessing the same file.
 * @returns The code with all HQL imports replaced by Blob URLs.
 */
async function inlineHqlImports(
  code: string,
  baseDir: string,
  verbose: boolean,
  cache = new Map<string, string>()
): Promise<string> {
  // Regex to match import statements that reference *.hql files.
  const regex = /(from\s+['"])([^'"]+\.hql)(['"])/g;
  const matches = [...code.matchAll(regex)];
  if (verbose && matches.length > 0) {
    console.log(`Found ${matches.length} HQL import(s) to inline.`);
  }
  
  // Process matches in reverse order so replacement doesn't affect earlier indices.
  for (const match of matches.reverse()) {
    const fullMatch = match[0];
    const prefix = match[1];
    const relPath = match[2];
    const suffix = match[3];
    const startIndex = match.index!;
    const endIndex = startIndex + fullMatch.length;
    
    // Compute the absolute URL of the imported HQL file.
    let importedFileUrl: URL;
    try {
      importedFileUrl = new URL(relPath, baseDir);
    } catch (error) {
      if (verbose) {
        console.error(`Error computing URL for ${relPath} with base ${baseDir}:`, error);
      }
      continue;
    }
    const importedFilePath = importedFileUrl.pathname;
    
    if (verbose) {
      console.log(`Inlining HQL import: ${relPath} -> ${importedFilePath}`);
    }
    
    let blobUrl: string;
    if (cache.has(importedFilePath)) {
      blobUrl = cache.get(importedFilePath)!;
    } else {
      // Read the HQL file.
      let importedSource: string;
      try {
        importedSource = await Deno.readTextFile(importedFilePath);
      } catch (error) {
        console.error(`Error reading file ${importedFilePath}:`, error);
        continue;
      }
      
      // Transpile the imported HQL file with bundling enabled.
      let importedTranspiled: string;
      try {
        importedTranspiled = await transpile(importedSource, importedFilePath, { bundle: true, verbose });
      } catch (error) {
        console.error(`Error transpiling ${importedFilePath}:`, error);
        continue;
      }
      
      // Determine the base directory for the imported file.
      const importedBaseDir = new URL('.', importedFileUrl).href;
      // Recursively inline any HQL imports inside the imported module.
      importedTranspiled = await inlineHqlImports(importedTranspiled, importedBaseDir, verbose, cache);
      
      // Create a Blob URL for the transpiled module.
      const blob = new Blob([importedTranspiled], { type: "application/javascript" });
      blobUrl = URL.createObjectURL(blob);
      cache.set(importedFilePath, blobUrl);
      if (verbose) {
        console.log(`Created Blob URL for ${importedFilePath}: ${blobUrl}`);
      }
    }
    
    // Replace the HQL import in the code with the Blob URL.
    const replacement = `${prefix}${blobUrl}${suffix}`;
    code = code.slice(0, startIndex) + replacement + code.slice(endIndex);
  }
  
  return code;
}

async function main() {
  // Remove any flag-like arguments from the file target.
  const args = Deno.args.filter(arg => !arg.startsWith("--"));
  const verbose = Deno.args.includes("--verbose");
  // Force bundle mode so all dependencies are inlined.
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
  
  // Transpile the main HQL file with bundling enabled.
  let transpiled = await transpile(userSource, targetPath, {
    bundle,
    verbose, 
    module: "esm"
  });
  
  if (verbose) {
    console.log(`Successfully transpiled "${targetPath}". Processing HQL imports inline.`);
  }
  
  // Compute the base directory as a file URL.
  const targetDir = new URL('.', `file://${targetPath.replace(/\\/g, "/")}`).href;
  
  // (Optional) Rewrite relative JS import paths to absolute URLs.
  transpiled = transpiled.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_, prefix, rel, suffix) => {
    try {
      const abs = new URL(rel, targetDir).href;
      return prefix + abs + suffix;
    } catch (error) {
      return prefix + rel + suffix;
    }
  });
  
  // Inline any HQL imports recursively.
  const finalCode = await inlineHqlImports(transpiled, targetDir, verbose);
  
  // Append a sourceURL comment to help with debugging.
  const sourceWithURL = finalCode + `\n//# sourceURL=file://${targetPath.replace(/\\/g, "/")}.js`;
  
  // Create a Blob URL for the final, fully inlined code and import it.
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
