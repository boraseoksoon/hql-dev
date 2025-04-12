#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Script to update all files in the codebase to use the logger singleton instead of creating new instances
 */

async function main() {
  const sourceDir = Deno.cwd();
  console.log(`Scanning ${sourceDir} for files that need logger updates...`);
  
  // Get all TypeScript files in the source directory
  const files = await findTsFiles(sourceDir);
  console.log(`Found ${files.length} TypeScript files to check.`);
  
  let modifiedCount = 0;
  
  for (const file of files) {
    // Skip the logger.ts file itself
    if (file.endsWith("logger.ts") || file.endsWith("logger-init.ts")) {
      continue;
    }
    
    try {
      const content = await Deno.readTextFile(file);
      
      // Check if file uses new Logger
      if (content.includes("new Logger(")) {
        console.log(`Found 'new Logger()' in ${file}`);
        
        // First, add the import if it doesn't exist
        let modifiedContent = content;
        
        if (!content.includes("import logger from")) {
          // Add import after existing imports
          if (content.includes("import {")) {
            modifiedContent = modifiedContent.replace(
              /(import .*?from .*?;(\r?\n)+)/,
              "$1import { getLogger } from \"./logger-init.ts\";\n"
            );
          } else {
            // No imports found, add at the top
            modifiedContent = "import { getLogger } from \"./logger-init.ts\";\n" + modifiedContent;
          }
        }
        
        // Replace new Logger instances with getLogger
        modifiedContent = modifiedContent
          .replace(/const logger = new Logger\(([^)]*)\);/g, "const logger = getLogger({ verbose: $1 });")
          .replace(/this\.logger = new Logger\(([^)]*)\);/g, "this.logger = getLogger({ verbose: $1 });");
        
        // Fix log method calls if they use direct strings
        modifiedContent = modifiedContent
          .replace(/logger\.log\((['"`].*?['"`])\);/g, "logger.debug($1);");
        
        // Write the file back if changes were made
        if (modifiedContent !== content) {
          await Deno.writeTextFile(file, modifiedContent);
          console.log(`✅ Updated ${file}`);
          modifiedCount++;
        }
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }
  
  console.log(`\nUpdate complete: ${modifiedCount} files were modified.`);
  console.log("\nNOTE: This script makes automatic replacements but you should review changes manually!");
  console.log("Some files may need additional fixes for proper logger usage.");
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