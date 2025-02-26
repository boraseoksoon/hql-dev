// cli/publish/build_js_module.ts
import { compile } from "../../cli/compile.ts";
import { join, resolve, dirname, basename } from "../../src/platform/platform.ts";
import { exists, emptyDir } from "jsr:@std/fs@1.0.13";

/**
 * Build a JavaScript module from an HQL file.
 * This performs the following steps:
 * 1. Compile the HQL file to JavaScript
 * 2. Create a proper entry point file
 * 
 * @param inputPath The HQL file path
 * @returns Promise<string> Path to the npm directory
 */
export async function buildJsModule(inputPath: string): Promise<string> {
  console.log(`Building JavaScript module from ${inputPath}...`);
  
  // Resolve the full path to the input file
  const absoluteInputPath = resolve(inputPath);
  
  // Check if the input is a file or directory
  let isFile = false;
  try {
    const stat = await Deno.stat(absoluteInputPath);
    isFile = stat.isFile;
  } catch (error) {
    console.error(`Error checking input path: ${error.message}`);
    throw error;
  }
  
  // Get the base directory
  const baseDir = isFile ? dirname(absoluteInputPath) : absoluteInputPath;
  
  // Create a build directory for intermediate files
  const buildDir = join(baseDir, ".build");
  
  try {
    // Clean up existing build directory
    await emptyDir(buildDir);
  } catch (error) {
    console.warn(`Warning: Could not clean build directory: ${error.message}`);
    // Create it if it doesn't exist
    try {
      await Deno.mkdir(buildDir, { recursive: true });
    } catch (mkdirError) {
      if (!(mkdirError instanceof Deno.errors.AlreadyExists)) {
        throw mkdirError;
      }
    }
  }
  
  // Compile the HQL file to JS
  const outputName = isFile ? basename(absoluteInputPath).replace(/\.hql$/, '.js') : "index.js";
  const outputPath = join(buildDir, outputName);
  
  try {
    await compile(absoluteInputPath, {
      outputPath,
      format: 'js',
      bundle: true,
      module: 'esm',
      target: 'es2020',
      logLevel: 2
    });
  } catch (error) {
    console.error("Error compiling HQL file:", error);
    // Try to continue anyway, as compile.ts might report errors but still produce output
  }
  
  // Create an entry file 
  const esmEntryFile = join(buildDir, "esm.js");
  
  try {
    // Check if the compiled JS file exists
    let compiledJs = "";
    if (await exists(outputPath)) {
      // Read the compiled JS
      compiledJs = await Deno.readTextFile(outputPath);
    } else {
      console.warn(`Warning: Compiled output file ${outputPath} not found. Creating a stub.`);
      compiledJs = `// Stub module\nexport default { name: "hql-module" };\n`;
    }
    
    // Write the entry file
    await Deno.writeTextFile(esmEntryFile, compiledJs);
    console.log(`Created entry file at ${esmEntryFile}`);
  } catch (error) {
    console.error("Error creating entry file:", error);
    // Create a minimal entry as fallback
    try {
      await Deno.writeTextFile(esmEntryFile, 
        `export default { name: "hql-module" };\n`);
    } catch (writeError) {
      console.error(`Failed to create fallback entry file: ${writeError.message}`);
      throw writeError;
    }
  }
  
  const npmDir = join(baseDir, "npm");
  try {
    await Deno.mkdir(npmDir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error;
    }
  }
  
  return npmDir;
}