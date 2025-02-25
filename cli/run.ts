// cli/run.ts
import {
  join,
  dirname,
  resolve,
  extname,
} from "https://deno.land/std@0.170.0/path/mod.ts";
import { bundleFile } from "../src/bundler.ts";

/**
 * Convert hyphenated identifiers to valid JavaScript identifiers.
 * e.g., "calculate-area" -> "calculateArea"
 */
function convertToValidJSIdentifier(name: string): string {
  // Replace hyphens followed by a character with the uppercase version of that character
  return name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Ensure all function definitions in the JavaScript code use valid identifiers
 * (without hyphens)
 */
function ensureValidIdentifiers(jsCode: string): string {
  // Fix any function definitions with hyphens
  // e.g., "function point-3d(" -> "function point3d("
  return jsCode.replace(/function ([a-zA-Z0-9_-]+)\(/g, (match, name) => {
    const validName = convertToValidJSIdentifier(name);
    return `function ${validName}(`;
  });
}

/**
 * For an HQL file:
 *   - Compile it in memory (in ES module mode)
 *   - Create a data URL from the compiled JS
 *   - Dynamically import that data URL to execute it
 */
async function runHQL(targetPath: string): Promise<void> {
  let compiledJS = await bundleFile(targetPath, new Set(), false);
  
  // Ensure the generated JavaScript has valid identifiers
  compiledJS = ensureValidIdentifiers(compiledJS);
  
  const dataUrl = "data:application/javascript;module;base64," + btoa(compiledJS);

  await import(dataUrl);
}

/**
 * For a JavaScript file:
 *   - Read its content and scan for any import statements that reference ".hql" files.
 *   - For each such import, resolve the HQL file relative to the JS file,
 *     compile it in memory, and replace its specifier with a data URL.
 *   - Create a new data URL for the patched JS source and dynamically import it.
 */
async function runJS(targetPath: string): Promise<void> {
  const targetDir = dirname(targetPath);
  let content = await Deno.readTextFile(targetPath);
  const regex = /import\s+([^'"]+)\s+from\s+["'](.*?\.hql)["']/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const [fullMatch, imported, specifier] = match;
    const hqlFilePath = resolve(targetDir, specifier);
    let compiledJS = await bundleFile(hqlFilePath, new Set(), false);
    
    // Ensure the generated JavaScript has valid identifiers
    compiledJS = ensureValidIdentifiers(compiledJS);
    
    const dataUrl = "data:application/javascript;module;base64," + btoa(compiledJS);
    const newImport = `import ${imported} from "${dataUrl}"`;
    content = content.replace(fullMatch, newImport);
  }
  const patchedUrl = "data:text/javascript;base64," + btoa(content);
  await import(patchedUrl);
}

/**
 * Entry point: Determine whether the target file is an HQL or a JS file
 * and run it accordingly.
 */
async function main() {
  const [target] = Deno.args;
  if (!target) {
    console.error("Usage: hql run <target.js|target.hql>");
    Deno.exit(1);
  }
  const targetPath = resolve(target);
  const ext = extname(targetPath);
  if (ext === ".hql") {
    await runHQL(targetPath);
  } else if (ext === ".js") {
    await runJS(targetPath);
  } else {
    console.error("Unsupported file type. Please provide a .hql or .js file.");
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}