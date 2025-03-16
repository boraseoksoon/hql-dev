// Enhanced run.ts with modular implementation for file tracking and cleanup
import { resolve, dirname } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI, OptimizationOptions } from "../src/bundler.ts";
import { Logger } from "../src/logger.ts";
import { MODES } from "./modes.ts";
import { parse } from "../src/transpiler/parser.ts";
import { transpile } from "../src/transformer.ts";
import { isImportNode } from "../src/transpiler/hql_ast.ts";
import { exists } from "jsr:@std/fs@1.0.13";

// ===== STATE TRACKING =====
// Track generated and existing files
const fileTracker = {
  generatedJsFiles: new Set<string>(),
  preExistingJsFiles: new Set<string>(),
  
  // Record a generated file
  trackGeneratedFile(filePath: string): void {
    this.generatedJsFiles.add(filePath);
  },
  
  // Record a pre-existing file
  trackExistingFile(filePath: string): void {
    this.preExistingJsFiles.add(filePath);
  },
  
  // Check if a file was generated during this run
  isGeneratedFile(filePath: string): boolean {
    return this.generatedJsFiles.has(filePath);
  },
  
  // Check if a file existed before processing
  isPreExistingFile(filePath: string): boolean {
    return this.preExistingJsFiles.has(filePath);
  },
  
  // Clear all tracked files
  clearTrackedFiles(): void {
    this.generatedJsFiles.clear();
  }
};

// ===== HELP OUTPUT =====
function printHelp(): void {
  console.error("Usage: deno run -A cli/run.ts <target.hql|target.js> [options]");
  console.error("\nOptions:");
  console.error("  --verbose         Enable verbose logging");
  console.error("  --performance     Apply aggressive performance optimizations (minify, drop console/debugger, etc.)");
  console.error("  --print           Print final JS output directly in CLI");
  console.error("  --keep-js         Keep intermediate JS files (don't clean up)");
  console.error("  --help, -h        Display this help message");
}

// ===== FILE SCANNING =====
/**
 * Scan a directory for existing .js files before processing
 */
async function scanForExistingJsFiles(startPath: string, logger: Logger): Promise<void> {
  logger.debug(`Recording existing JS files starting from: ${startPath}`);
  
  // Determine base directory for scanning
  const baseDir = await getBaseDirectory(startPath);
  
  // Scan the directory for JS files
  try {
    for await (const entry of Deno.readDir(baseDir)) {
      if (entry.isFile && entry.name.endsWith('.js')) {
        const fullPath = resolve(baseDir, entry.name);
        fileTracker.trackExistingFile(fullPath);
        logger.debug(`Recorded existing JS file: ${fullPath}`);
      }
    }
    logger.debug(`Recorded ${fileTracker.preExistingJsFiles.size} existing JS files`);
  } catch (e) {
    logger.error(`Error scanning directory: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Get the base directory from a path (handles both file and directory paths)
 */
async function getBaseDirectory(path: string): Promise<string> {
  try {
    const stat = await Deno.stat(path);
    return stat.isFile ? dirname(path) : path;
  } catch (e) {
    // If path doesn't exist, assume it's a file path and return its dirname
    return dirname(path);
  }
}

// ===== IMPORT PREPROCESSING =====
/**
 * Preprocess all HQL imports by creating JS files before execution
 */
async function preprocessHqlImports(entryPath: string, logger: Logger): Promise<void> {
  logger.debug(`Preprocessing HQL imports for entry: ${entryPath}`);
  
  // Track processed files to avoid circular dependencies
  const processed = new Set<string>();
  await processFileImports(entryPath, processed, logger);
  
  logger.debug("Preprocessing complete");
}

/**
 * Process imports for a specific file and its dependencies
 */
async function processFileImports(filePath: string, processed: Set<string>, logger: Logger): Promise<void> {
  // Skip already processed files
  if (processed.has(filePath)) {
    return;
  }
  processed.add(filePath);
  
  // Select processing method based on file type
  if (filePath.endsWith('.hql')) {
    await processHqlFile(filePath, processed, logger);
  } else if (filePath.endsWith('.js')) {
    await processJsFile(filePath, processed, logger);
  }
}

/**
 * Process an HQL file - transpile to JS and process imports
 */
async function processHqlFile(filePath: string, processed: Set<string>, logger: Logger): Promise<void> {
  const jsOutputPath = filePath.replace(/\.hql$/, '.js');
  logger.debug(`Transpiling HQL file: ${filePath} -> ${jsOutputPath}`);
  
  try {
    // Read and transpile HQL file
    const source = await Deno.readTextFile(filePath);
    const transpiled = await transpile(source, filePath, { bundle: false, verbose: logger.enabled });
    await Deno.writeTextFile(jsOutputPath, transpiled);
    
    // Track the generated JS file for cleanup
    fileTracker.trackGeneratedFile(jsOutputPath);
    
    // Process imports in the HQL file
    await processHqlImports(filePath, source, processed, logger);
  } catch (e) {
    logger.error(`Error transpiling ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Process imports found in an HQL file
 */
async function processHqlImports(filePath: string, source: string, processed: Set<string>, logger: Logger): Promise<void> {
  try {
    const ast = parse(source);
    for (const node of ast) {
      if (isImportNode(node)) {
        const importPath = extractImportPath(node);
        if (importPath) {
          const importFullPath = resolve(dirname(filePath), importPath);
          await processFileImports(importFullPath, processed, logger);
        }
      }
    }
  } catch (e) {
    logger.error(`Error processing imports in ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Process a JS file - find HQL imports and handle them
 */
async function processJsFile(filePath: string, processed: Set<string>, logger: Logger): Promise<void> {
  try {
    const source = await Deno.readTextFile(filePath);
    
    // Find HQL imports
    const hqlImports = findHqlImports(source);
    
    if (hqlImports.length > 0) {
      logger.debug(`Found ${hqlImports.length} HQL imports in JS file: ${filePath}`);
      
      // Process each imported HQL file
      for (const importPath of hqlImports) {
        const importFullPath = resolve(dirname(filePath), importPath);
        await processFileImports(importFullPath, processed, logger);
      }
      
      // Modify the JS file to use JS imports instead of HQL
      await modifyJsImports(filePath, source, hqlImports, logger);
    }
  } catch (e) {
    logger.error(`Error processing JS file ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Find HQL imports in a JS file
 */
function findHqlImports(source: string): string[] {
  const hqlImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.hql)['"]/g;
  const imports: string[] = [];
  let match;
  
  while ((match = hqlImportRegex.exec(source)) !== null) {
    imports.push(match[1]);
  }
  
  return imports;
}

/**
 * Modify JS file to replace HQL imports with JS imports
 */
async function modifyJsImports(filePath: string, source: string, hqlImports: string[], logger: Logger): Promise<void> {
  // Create a modified version with .js instead of .hql
  let modified = source;
  for (const importPath of hqlImports) {
    const jsImportPath = importPath.replace(/\.hql$/, '.js');
    modified = modified.replace(
      new RegExp(`(['"])${escapeRegExp(importPath)}(['"])`, 'g'),
      `$1${jsImportPath}$2`
    );
  }
  
  // Create a backup of the original file
  const backupPath = `${filePath}.bak`;
  await Deno.writeTextFile(backupPath, source);
  logger.debug(`Backup created: ${backupPath}`);
  
  // Write the modified file
  await Deno.writeTextFile(filePath, modified);
  logger.debug(`Modified JS file saved: ${filePath}`);
}

/**
 * Extract import path from an AST node
 */
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

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ===== FILE RESTORATION =====
/**
 * Restore original JS files from backups
 */
async function restoreOriginalFiles(logger: Logger): Promise<void> {
  logger.debug("Restoring original JS files from backups");
  
  // Find all .bak files in the current directory
  const workDir = Deno.cwd();
  for await (const entry of Deno.readDir(workDir)) {
    if (entry.isFile && entry.name.endsWith('.js.bak')) {
      const backupPath = resolve(workDir, entry.name);
      const originalPath = backupPath.slice(0, -4); // Remove .bak
      
      try {
        // Restore original
        await Deno.copyFile(backupPath, originalPath);
        await Deno.remove(backupPath);
        logger.debug(`Restored original file: ${originalPath}`);
      } catch (e) {
        logger.error(`Error restoring ${originalPath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}

// ===== CLEANUP =====
/**
 * Clean up generated JS files using safe criteria
 */
async function cleanupGeneratedFiles(logger: Logger, keepFiles: boolean): Promise<void> {
  if (keepFiles) {
    logger.log(`Keeping ${fileTracker.generatedJsFiles.size} intermediate JS files as requested`);
    return;
  }
  
  logger.debug(`Starting cleanup of ${fileTracker.generatedJsFiles.size} generated JS files`);
  let removedCount = 0;
  
  for (const filePath of fileTracker.generatedJsFiles) {
    // Apply all safety checks before removal
    if (await shouldRemoveFile(filePath, logger)) {
      try {
        await Deno.remove(filePath);
        logger.debug(`Removed generated file: ${filePath}`);
        removedCount++;
      } catch (e) {
        logger.error(`Error removing file ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  
  // Clear the tracking set after cleanup
  fileTracker.clearTrackedFiles();
  logger.log(`Cleanup complete: removed ${removedCount} generated JS files`);
}

/**
 * Determine if a file should be removed based on multiple safety criteria
 */
async function shouldRemoveFile(filePath: string, logger: Logger): Promise<boolean> {
  // Skip files that existed before processing
  if (fileTracker.isPreExistingFile(filePath)) {
    logger.debug(`Skipping pre-existing file: ${filePath}`);
    return false;
  }
  
  // Check if file still exists
  const fileInfo = await Deno.stat(filePath).catch(() => null);
  if (!fileInfo) {
    logger.debug(`File no longer exists: ${filePath}`);
    return false;
  }
  
  // Check for corresponding HQL file
  const hqlPath = filePath.replace(/\.js$/, '.hql');
  const hqlExists = await exists(hqlPath);
  
  if (!hqlExists) {
    logger.debug(`Keeping generated file with no corresponding HQL: ${filePath}`);
    return false;
  }
  
  // All checks passed - safe to remove
  return true;
}

// ===== MAIN EXECUTION =====
/**
 * Main entry point for HQL running
 */
async function runModule(): Promise<void> {
  // Process command-line arguments
  const options = parseCommandLineArgs();
  if (options.showHelp) {
    printHelp();
    Deno.exit(0);
  }
  
  if (options.args.length < 1) {
    printHelp();
    Deno.exit(1);
  }
  
  const inputPath = resolve(options.args[0]);
  const logger = new Logger(options.verbose);
  logger.log(`Processing entry: ${inputPath}`);

  try {
    // Execute HQL processing pipeline
    await executeProcessingPipeline(inputPath, options, logger);
  } catch (error) {
    logger.error(`Error during processing: ${error instanceof Error ? error.message : String(error)}`);
    
    // Always try cleanup even on errors
    await executeCleanupProcess(options.keepJs, logger);
    throw error;
  }
}

/**
 * Parse command-line arguments
 */
function parseCommandLineArgs(): {
  args: string[],
  verbose: boolean,
  performance: boolean,
  printOutput: boolean,
  keepJs: boolean,
  showHelp: boolean
} {
  return {
    args: Deno.args.filter((arg) => !arg.startsWith("--")),
    verbose: Deno.args.includes("--verbose"),
    performance: Deno.args.includes("--performance"),
    printOutput: Deno.args.includes("--print"),
    keepJs: Deno.args.includes("--keep-js"),
    showHelp: Deno.args.includes("--help") || Deno.args.includes("-h")
  };
}

/**
 * Execute the full HQL processing pipeline
 */
async function executeProcessingPipeline(inputPath: string, options: any, logger: Logger): Promise<void> {
  // Step 1: Record existing JS files
  await scanForExistingJsFiles(inputPath, logger);
  
  // Step 2: Preprocess HQL imports
  await preprocessHqlImports(inputPath, logger);
  
  // Step 3: Create temp directory and configure options
  const { tempDir, bundledPath } = await setupAndBundle(inputPath, options, logger);
  
  // Step 4: Print output if requested
  if (options.printOutput) {
    await printBundledOutput(bundledPath);
  }
  
  // Step 5: Execute the bundled code
  logger.log(`Running bundled output: ${bundledPath}`);
  await import("file://" + resolve(bundledPath));
  
  // Step 6: Clean up temp directory
  await Deno.remove(tempDir, { recursive: true });
  logger.log(`Cleaned up temporary directory: ${tempDir}`);
  
  // Step 7: Cleanup generated files
  await executeCleanupProcess(options.keepJs, logger);
}

/**
 * Set up bundling environment and bundle the code
 */
async function setupAndBundle(inputPath: string, options: any, logger: Logger): Promise<{ 
  tempDir: string, 
  bundledPath: string 
}> {
  // Create temporary directory
  const tempDir = await Deno.makeTempDir();
  const tempOutput = resolve(tempDir, "bundled.js");
  
  // Prepare optimization options
  let optimizationOptions: OptimizationOptions = {};
  if (options.performance) {
    logger.log("Aggressive performance optimizations enabled.");
    optimizationOptions = { ...MODES.performance };
  }
  
  // Transpile and bundle
  const bundledPath = await transpileCLI(
    inputPath, 
    tempOutput, 
    { verbose: options.verbose, ...optimizationOptions }
  );
  
  return { tempDir, bundledPath };
}

/**
 * Print bundled output if requested
 */
async function printBundledOutput(bundledPath: string): Promise<void> {
  const finalOutput = await Deno.readTextFile(bundledPath);
  console.log(finalOutput);
}

/**
 * Execute the full cleanup process (file restoration and cleanup)
 */
async function executeCleanupProcess(keepJs: boolean, logger: Logger): Promise<void> {
  try {
    // Restore original JS files
    await restoreOriginalFiles(logger);
    
    // Clean up generated JS files
    await cleanupGeneratedFiles(logger, keepJs);
  } catch (cleanupError) {
    logger.error(`Error during cleanup: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
  }
}

// Execute if this is the main module
if (import.meta.main) {
  runModule().catch((error) => {
    console.error("Error:", error);
    Deno.exit(1);
  });
}