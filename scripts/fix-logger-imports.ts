#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Script to fix incorrect logger-init.ts import paths across the codebase
 */

async function main() {
  const sourceDir = Deno.cwd();
  console.log(`Scanning ${sourceDir} for files with incorrect logger-init.ts imports...`);
  
  // Get all TypeScript files in the source directory
  const files = await findTsFiles(sourceDir);
  console.log(`Found ${files.length} TypeScript files to check.`);
  
  let modifiedCount = 0;
  
  // Define proper import paths based on file location
  const pathMap = new Map<string, string>([
    // Files in src/ root - import from ./logger-init.ts
    ["src/", "./logger-init.ts"],
    
    // Files in subdirectories directly under src/ - import from ../logger-init.ts
    ["src/s-exp/", "../logger-init.ts"],
    ["src/utils/", "../logger-init.ts"],
    ["src/repl/", "../logger-init.ts"],
    ["src/transpiler/", "../logger-init.ts"],
    
    // Files two levels down - import from ../../logger-init.ts
    ["src/transpiler/pipeline/", "../../logger-init.ts"],
    ["src/transpiler/error/", "../../logger-init.ts"],
    ["src/transpiler/syntax/", "../../logger-init.ts"],
    ["src/transpiler/fx/", "../../logger-init.ts"],
  ]);
  
  for (const file of files) {
    // Don't modify logger-init.ts itself
    if (file.endsWith("logger-init.ts")) {
      continue;
    }
    
    try {
      const content = await Deno.readTextFile(file);
      
      // Check if file imports from logger-init.ts
      if (content.includes("import") && 
          content.includes("logger-init.ts") &&
          !content.includes("../src/logger-init.ts")) {
          
        // Determine correct import path based on file location
        let correctPath = null;
        
        for (const [dirPrefix, importPath] of pathMap.entries()) {
          if (file.includes(dirPrefix)) {
            correctPath = importPath;
            break;
          }
        }
        
        if (!correctPath) {
          console.log(`Couldn't determine correct import path for ${file}, skipping`);
          continue;
        }
        
        // Fix the import path
        let modifiedContent = content;
        
        // Match both import { X } and import X patterns
        const importRegex = /import\s+(?:\{[^}]*\}|[\w\d_]+)\s+from\s+["']([^"']+logger-init\.ts)["']/g;
        modifiedContent = modifiedContent.replace(importRegex, (match, importPath) => {
          if (importPath === correctPath) {
            return match; // Already correct
          }
          return match.replace(importPath, correctPath);
        });
        
        // Write the file back if changes were made
        if (modifiedContent !== content) {
          await Deno.writeTextFile(file, modifiedContent);
          console.log(`✅ Updated import in ${file}`);
          modifiedCount++;
        }
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }
  
  console.log(`\nUpdate complete: ${modifiedCount} files were modified.`);
}

async function findTsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const entryPath = `${dir}/${entry.name}`;
    if (entry.isDirectory && !entryPath.includes("node_modules") && !entryPath.includes(".git")) {
      files.push(...await findTsFiles(entryPath));
    } else if (entry.isFile && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }
  return files;
}

if (import.meta.main) {
  await main();
} 