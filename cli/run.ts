// Modified run.ts with correct hybrid solution
import { resolve, dirname, basename, join } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI, OptimizationOptions } from "../src/bundler.ts";
import { Logger } from "../src/logger.ts";
import { MODES } from "./modes.ts";
import { parse } from "../src/transpiler/parser.ts";
import { transpile } from "../src/transformer.ts";
import { isImportNode } from "../src/transpiler/hql_ast.ts";

// Track generated files for cleanup
const generatedTempFiles = new Set<string>();

function printHelp() {
  console.error("Usage: deno run -A cli/run.ts <target.hql|target.js> [options]");
  console.error("\nOptions:");
  console.error("  --verbose         Enable verbose logging");
  console.error("  --performance     Apply aggressive performance optimizations");
  console.error("  --print           Print final JS output directly in CLI");
  console.error("  --keep-js         Keep intermediate JS files (don't clean up)");
  console.error("  --help, -h        Display this help message");
}

/**
 * Preprocess HQL imports in a temporary directory
 */
async function preprocessHqlImports(entryPath: string, logger: Logger): Promise<string> {
  logger.debug(`Preprocessing HQL imports for entry: ${entryPath}`);
  
  // Create a temp directory for all operations
  const tempDir = await Deno.makeTempDir({ prefix: "hql_run_" });
  logger.debug(`Created temporary workspace: ${tempDir}`);
  
  // Keep track of all files
  const originalToTempMap = new Map<string, string>();
  const processedFiles = new Set<string>();
  
  // Copy entry file to temp dir
  const entryName = basename(entryPath);
  const tempEntryPath = join(tempDir, entryName);
  await Deno.copyFile(entryPath, tempEntryPath);
  logger.debug(`Copied entry file to: ${tempEntryPath}`);
  originalToTempMap.set(entryPath, tempEntryPath);
  
  // In cli/run.ts, update the extractImportPath and processFile functions:

// Add this helper function to check if a path is a URL
function isUrl(path: string): boolean {
  return path.startsWith('http://') || path.startsWith('https://');
}

// Helper to extract import path from a node
  function extractImportPath(node: any): string | null {
    if (node.type === "list" && 
        node.elements.length >= 3 && 
        node.elements[0].type === "symbol" && 
        node.elements[0].name === "import" &&
        node.elements[2].type === "literal") {
      return node.elements[2].value;
    }
    return null;
  }

// Updated processFile function with URL handling
async function processFile(originalPath: string, isEntrypoint: boolean = false): Promise<void> {
  // Skip if already processed
  if (processedFiles.has(originalPath)) {
    return;
  }
  processedFiles.add(originalPath);
  
  // Handle URL imports differently
  if (isUrl(originalPath)) {
    logger.debug(`Skipping preprocessing for URL import: ${originalPath}`);
    return; // Skip preprocessing for URLs, Deno will handle these directly
  }
  
  // Get or create temp path
  let tempPath: string;
  if (originalToTempMap.has(originalPath)) {
    tempPath = originalToTempMap.get(originalPath)!;
  } else {
    // Create temp path
    const baseName = basename(originalPath);
    tempPath = join(tempDir, baseName);
    // Copy file to temp
    await Deno.copyFile(originalPath, tempPath);
    logger.debug(`Copied ${originalPath} to ${tempPath}`);
    originalToTempMap.set(originalPath, tempPath);
  }
  
  // Process based on file type
  if (originalPath.endsWith('.hql')) {
    // For HQL files, transpile to JS
    const tempJsPath = tempPath.replace(/\.hql$/, '.js');
    
    try {
      // Read the source (from temp path)
      const source = await Deno.readTextFile(tempPath);
      
      // First, find and process imports in the HQL source
      try {
        const ast = parse(source);
        for (const node of ast) {
          if (isImportNode(node)) {
            const importPath = extractImportPath(node);
            if (importPath) {
              // Skip URL imports, they'll be handled by Deno
              if (isUrl(importPath)) {
                logger.debug(`Found URL import: ${importPath} - will be handled by Deno directly`);
                continue;
              }
              
              // Get full path of the local import
              const originalImportPath = resolve(dirname(originalPath), importPath);
              await processFile(originalImportPath);
            }
          }
        }
      } catch (e) {
        logger.error(`Error parsing imports in ${tempPath}: ${e.message}`);
      }
      
      // Now transpile HQL to JS (after imports are processed)
      const transpiled = await transpile(source, tempPath, { 
        bundle: false, 
        verbose: logger.enabled 
      });
      
      // Write the transpiled JS file
      await Deno.writeTextFile(tempJsPath, transpiled);
      logger.debug(`Transpiled ${tempPath} to ${tempJsPath}`);
      
      // Track the generated JS file
      generatedTempFiles.add(tempJsPath);
    } catch (e) {
      logger.error(`Error processing HQL file ${tempPath}: ${e.message}`);
    }
  } 
  else if (originalPath.endsWith('.js')) {
    try {
      // Read the JS file
      const source = await Deno.readTextFile(tempPath);
      
      // Find HQL imports
      const hqlImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.hql)['"]/g;
      let match;
      const imports = [];
      
      // Find all imports and process them first
      while ((match = hqlImportRegex.exec(source)) !== null) {
        const importPath = match[1];
        imports.push(importPath);
        
        // Skip URL imports
        if (isUrl(importPath)) {
          logger.debug(`Found URL import in JS file: ${importPath} - will be handled by Deno directly`);
          continue;
        }
        
        // Get full path of the import
        const originalImportPath = resolve(dirname(originalPath), importPath);
        
        // Process the import - this ensures its JS file is created
        await processFile(originalImportPath);
      }
      
      // Now modify the imports in this JS file
      if (imports.length > 0) {
        logger.debug(`Fixing ${imports.length} HQL imports in JS file: ${tempPath}`);
        
        // Create a modified version with .js instead of .hql
        let modified = source;
        for (const importPath of imports) {
          // Only replace extensions for local imports
          if (!isUrl(importPath)) {
            const jsImportPath = importPath.replace(/\.hql$/, '.js');
            modified = modified.replace(
              new RegExp(`(['"])${escapeRegExp(importPath)}(['"])`, 'g'),
              `$1${jsImportPath}$2`
            );
          }
        }
        
        // Update the file in the temp directory
        await Deno.writeTextFile(tempPath, modified);
        logger.debug(`Updated imports in ${tempPath}`);
      }
      
      // Also find and process JS imports
      const jsImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.js)['"]/g;
      while ((match = jsImportRegex.exec(source)) !== null) {
        const importPath = match[1];
        
        // Skip URL imports
        if (isUrl(importPath)) {
          logger.debug(`Found URL JS import: ${importPath} - will be handled by Deno directly`);
          continue;
        }
        
        const originalImportPath = resolve(dirname(originalPath), importPath);
        
        // Process JS imports too
        await processFile(originalImportPath);
      }
    } catch (e) {
      logger.error(`Error processing JS file ${tempPath}: ${e.message}`);
    }
  }
}
  
  // Helper to escape special regex characters
  function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  // Start processing from the entry file
  await processFile(entryPath, true);
  
  logger.debug("Preprocessing complete - all imports handled");
  return tempEntryPath;
}

// Clean up a directory
async function cleanupDir(dir: string, logger: Logger): Promise<void> {
  try {
    await Deno.remove(dir, { recursive: true });
    logger.debug(`Cleaned up directory: ${dir}`);
  } catch (e) {
    logger.error(`Error cleaning up ${dir}: ${e.message}`);
  }
}

async function runModule(): Promise<void> {
  // Check if help is requested
  if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
    printHelp();
    Deno.exit(0);
  }

  // Parse options
  const args = Deno.args.filter((arg) => !arg.startsWith("--"));
  const verbose = Deno.args.includes("--verbose");
  const performance = Deno.args.includes("--performance");
  const printOutput = Deno.args.includes("--print");
  const keepJs = Deno.args.includes("--keep-js");
  const logger = new Logger(verbose);

  if (args.length < 1) {
    printHelp();
    Deno.exit(1);
  }

  const inputPath = resolve(args[0]);
  logger.log(`Processing entry: ${inputPath}`);

  let tempDir: string | null = null;
  
  try {
    // Preprocess HQL imports in a temp directory
    const tempEntryPath = await preprocessHqlImports(inputPath, logger);
    tempDir = dirname(tempEntryPath);
    
    // Create output path for bundled result
    const tempOutput = join(tempDir, "bundled.js");

    // Prepare optimization options
    const optimizationOptions: OptimizationOptions = performance ? { ...MODES.performance } : {};

    // Transpile and bundle using the temp entry
    logger.log(`Bundling entry file: ${tempEntryPath}`);
    const bundledPath = await transpileCLI(tempEntryPath, tempOutput, { 
      verbose, 
      ...optimizationOptions
    });
    
    if (printOutput) {
      // Print the output to console
      const finalOutput = await Deno.readTextFile(bundledPath);
      console.log(finalOutput);
    }
    
    logger.log(`Running bundled output: ${bundledPath}`);
    
    // Import and run the bundled module
    await import("file://" + resolve(bundledPath));
    
    // Clean up temporary directory
    if (!keepJs && tempDir) {
      await cleanupDir(tempDir, logger);
      tempDir = null;
    } else if (keepJs) {
      logger.log(`Keeping temporary files in: ${tempDir}`);
    }
  } catch (error) {
    logger.error(`Error during processing: ${error instanceof Error ? error.message : String(error)}`);
    
    // Clean up on error
    if (tempDir && !keepJs) {
      await cleanupDir(tempDir, logger);
    }
    
    throw error;
  }
}

if (import.meta.main) {
  runModule().catch((error) => {
    console.error("Error:", error);
    Deno.exit(1);
  });
}