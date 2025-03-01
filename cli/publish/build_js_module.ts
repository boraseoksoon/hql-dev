// cli/publish/build_js_module.ts - Updated with bundling support

import transpileCLI from "../transpile.ts";
import { join, resolve, dirname, basename } from "../../src/platform/platform.ts";
import { exists, emptyDir, copy, ensureDir } from "jsr:@std/fs@1.0.13";

/**
 * Build a JavaScript module from an HQL file.
 * This performs the following steps:
 * 1. Transpile the HQL file to JavaScript with bundling enabled
 * 2. Create a proper directory structure for publishing
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
  
  // Transpile the HQL file to JS with bundling enabled
  const outputName = isFile ? basename(absoluteInputPath).replace(/\.hql$/, '.js') : "index.js";
  const outputPath = join(buildDir, outputName);
  
  try {
    // Always use bundling for publishing to ensure self-contained modules
    await transpileCLI(absoluteInputPath, outputPath, { 
      bundle: true,
      verbose: true 
    });
    console.log(`Successfully bundled module for publishing: ${outputPath}`);
  } catch (error) {
    console.error("Error transpiling HQL file:", error);
    // Try to continue anyway, as transpileCLI might report errors but still produce output
  }
  
  // Create the npm directory for the final output
  const npmDir = join(baseDir, "npm");
  await ensureDir(npmDir, { recursive: true });
  
  // Create the esm directory structure inside npm
  const esmDir = join(npmDir, "esm");
  await ensureDir(esmDir, { recursive: true });
  
  // Create the types directory structure inside npm
  const typesDir = join(npmDir, "types");
  await ensureDir(typesDir, { recursive: true });
  
  // Create entry files
  try {
    // Check if the transpiled JS file exists
    let transpiledJs = "";
    if (await exists(outputPath)) {
      // Read the transpiled JS
      transpiledJs = await Deno.readTextFile(outputPath);
    } else {
      console.warn(`Warning: Transpiled output file ${outputPath} not found. Creating a stub.`);
      transpiledJs = `// Stub module\nexport default { name: "hql-module" };\n`;
    }
    
    // Write the main esm index file
    const esmIndexFile = join(esmDir, "index.js");
    await Deno.writeTextFile(esmIndexFile, transpiledJs);
    console.log(`Created ESM index file at ${esmIndexFile}`);
    
    // Create a type definition file
    const typesIndexFile = join(typesDir, "index.d.ts");
    await Deno.writeTextFile(typesIndexFile, `declare const _default: any;\nexport default _default;\n`);
    console.log(`Created types definition file at ${typesIndexFile}`);
    
    // Create a basic README.md if it doesn't exist
    const readmePath = join(npmDir, "README.md");
    if (!await exists(readmePath)) {
      await Deno.writeTextFile(readmePath, `# HQL Module\n\nAuto-generated README for the HQL module.\n`);
    }
  } catch (error) {
    console.error("Error creating module files:", error);
    throw error;
  }
  
  return npmDir;
}