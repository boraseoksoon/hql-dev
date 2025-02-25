// cli/run.ts
import {
    join,
    dirname,
    resolve,
    extname,
  } from "https://deno.land/std@0.170.0/path/mod.ts";
  import { bundleFile } from "../src/bundler.ts";
  
  /**
   * For an HQL file:
   *   - Compile it in memory (in ES module mode)
   *   - Create a data URL from the compiled JS
   *   - Dynamically import that data URL to execute it
   */
  async function runHQL(targetPath: string): Promise<void> {
    const compiledJS = await bundleFile(targetPath, new Set(), false);
    const dataUrl = "data:text/javascript;base64," + btoa(compiledJS);
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
    // Regex to match import statements for .hql files.
    // It matches: import ... from "something.hql" or 'something.hql'
    const regex = /import\s+([^'"]+)\s+from\s+["'](.*?\.hql)["']/g;
    let match: RegExpExecArray | null;
    // Process all matches asynchronously.
    while ((match = regex.exec(content)) !== null) {
      const [fullMatch, imported, specifier] = match;
      // Resolve the HQL file relative to the JS file's directory.
      const hqlFilePath = resolve(targetDir, specifier);
      // Compile the HQL file to JS (in ES module mode)
      const compiledJS = await bundleFile(hqlFilePath, new Set(), false);
      // Create a data URL for the compiled code.
      const dataUrl = "data:text/javascript;base64," + btoa(compiledJS);
      // Replace the specifier in the original import statement with the data URL.
      const newImport = `import ${imported} from "${dataUrl}"`;
      content = content.replace(fullMatch, newImport);
    }
    // Create a data URL for the patched JS source.
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
  