// cli/publish/build_js_module.ts - Updated with bundling support

import transpileCLI from "../transpile.ts";
import { join, resolve, dirname, basename } from "../../src/platform/platform.ts";
import { exists, emptyDir } from "jsr:@std/fs@1.0.13";

/**
 * Build a JavaScript module from an HQL file.
 * This performs the following steps:
 * 1. Transpile the HQL file to JavaScript with bundling enabled
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
  
  // Create an entry file 
  const esmEntryFile = join(buildDir, "esm.js");
  
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
    
    // Write the entry file
    await Deno.writeTextFile(esmEntryFile, transpiledJs);
    console.log(`Created entry file at ${esmEntryFile}`);
  } catch (error) {
    console.error("Error creating entry file:", error);
    // Create a minimal entry as fallback
    try {
      await Deno.writeTextFile(esmEntryFile, `export default { name: "hql-module" };\n`);
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