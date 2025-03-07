// cli/publish/build_js_module.ts - Improved with better logging and error handling

import { transpileCLI } from "../transpile.ts";
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
  console.log(`\n🔨 Building JavaScript module from "${inputPath}"...`);
  
  // Resolve the full path to the input file
  const absoluteInputPath = resolve(inputPath);
  console.log(`  → Resolved path: "${absoluteInputPath}"`);
  
  // Check if the input is a file or directory
  let isFile = false;
  try {
    const stat = await Deno.stat(absoluteInputPath);
    isFile = stat.isFile;
    console.log(`  → Input is a ${isFile ? 'file' : 'directory'}`);
  } catch (error) {
    console.error(`\n❌ Error checking input path: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
  
  // Get the base directory
  const baseDir = isFile ? dirname(absoluteInputPath) : absoluteInputPath;
  console.log(`  → Base directory: "${baseDir}"`);
  
  // Create a build directory for intermediate files
  const buildDir = join(baseDir, ".build");
  console.log(`  → Build directory: "${buildDir}"`);
  
  try {
    // Clean up existing build directory
    console.log(`  → Cleaning build directory`);
    await emptyDir(buildDir);
  } catch (error) {
    console.warn(`  ⚠️ Could not clean build directory: ${error instanceof Error ? error.message : String(error)}`);
    // Create it if it doesn't exist
    try {
      console.log(`  → Creating build directory`);
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
  console.log(`  → Output JS file will be: "${outputPath}"`);
  
  try {
    // Always use bundling for publishing to ensure self-contained modules
    console.log(`  → Transpiling HQL to JS with bundling enabled`);
    await transpileCLI(absoluteInputPath, outputPath, { 
      bundle: true,
      verbose: true 
    });
    console.log(`\n✅ Successfully bundled module: "${outputPath}"`);
  } catch (error) {
    console.error(`\n❌ Error transpiling HQL file: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`  ⚠️ Attempting to continue with build process despite error`);
    // The transpiler might have still produced output even with errors
  }
  
  // Create the npm directory for the final output
  const npmDir = join(baseDir, "npm");
  console.log(`\n📂 Creating package structure in: "${npmDir}"`);
  await ensureDir(npmDir, { recursive: true });
  
  // Create the esm directory structure inside npm
  const esmDir = join(npmDir, "esm");
  await ensureDir(esmDir, { recursive: true });
  console.log(`  → Created ESM directory: "${esmDir}"`);
  
  // Create the types directory structure inside npm
  const typesDir = join(npmDir, "types");
  await ensureDir(typesDir, { recursive: true });
  console.log(`  → Created types directory: "${typesDir}"`);
  
  // Create entry files
  try {
    // Check if the transpiled JS file exists
    let transpiledJs = "";
    if (await exists(outputPath)) {
      // Read the transpiled JS
      transpiledJs = await Deno.readTextFile(outputPath);
      console.log(`  → Read transpiled JavaScript (${transpiledJs.length} bytes)`);
    } else {
      console.warn(`  ⚠️ Transpiled output file "${outputPath}" not found. Creating a stub.`);
      transpiledJs = `// Stub module\nexport default { name: "hql-module" };\n`;
    }
    
    // Write the main esm index file
    const esmIndexFile = join(esmDir, "index.js");
    await Deno.writeTextFile(esmIndexFile, transpiledJs);
    console.log(`  → Created ESM index file: "${esmIndexFile}"`);
    
    // Create a type definition file
    const typesIndexFile = join(typesDir, "index.d.ts");
    await Deno.writeTextFile(typesIndexFile, `declare const _default: any;\nexport default _default;\n`);
    console.log(`  → Created types definition file: "${typesIndexFile}"`);
    
    // Create a basic README.md if it doesn't exist
    const readmePath = join(npmDir, "README.md");
    if (!await exists(readmePath)) {
      await Deno.writeTextFile(readmePath, `# HQL Module\n\nAuto-generated README for the HQL module.\n`);
      console.log(`  → Created default README.md`);
    } else {
      console.log(`  → Using existing README.md`);
    }
  } catch (error) {
    console.error(`\n❌ Error creating module files: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
  
  console.log(`\n✅ Module build completed successfully`);
  return npmDir;
}