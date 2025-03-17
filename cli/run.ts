// Modified run.ts with modular architecture and improved readability
import { resolve, dirname, basename, join } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI, OptimizationOptions } from "../src/bundler.ts";
import { Logger } from "../src/logger.ts";
import { MODES } from "./modes.ts";
import { parse } from "../src/transpiler/parser.ts";
import { transpile } from "../src/transformer.ts";
import { isImportNode, extractImportPath } from "../src/transpiler/hql_ast.ts";
import { cleanupDir } from "../src/platform/platform.ts";
import { isUrl, escapeRegExp } from "../src/utils.ts";

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
  
  // Process the entry file and its imports
  await processFile(entryPath, tempDir, originalToTempMap, processedFiles, logger, true);
  
  logger.debug("Preprocessing complete - all imports handled");
  return tempEntryPath;
}

/**
 * Main function to process a file and its imports
 */
async function processFile(
  originalPath: string, 
  tempDir: string,
  originalToTempMap: Map<string, string>,
  processedFiles: Set<string>,
  logger: Logger,
): Promise<void> {
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
  
  // Create or retrieve temp path
  const tempPath = await createOrGetTempPath(originalPath, tempDir, originalToTempMap, logger);
  
  // Process based on file type
  if (originalPath.endsWith('.hql')) {
    await processHqlFile(originalPath, tempPath, tempDir, originalToTempMap, processedFiles, logger);
  } 
  else if (originalPath.endsWith('.js')) {
    await processJsFile(originalPath, tempPath, tempDir, originalToTempMap, processedFiles, logger);
  }
}

/**
 * Create or get a temporary path for a file
 */
async function createOrGetTempPath(
  originalPath: string,
  tempDir: string,
  originalToTempMap: Map<string, string>,
  logger: Logger
): Promise<string> {
  if (originalToTempMap.has(originalPath)) {
    return originalToTempMap.get(originalPath)!;
  }
  
  // Create temp path
  const baseName = basename(originalPath);
  const tempPath = join(tempDir, baseName);
  
  // Copy file to temp
  await Deno.copyFile(originalPath, tempPath);
  logger.debug(`Copied ${originalPath} to ${tempPath}`);
  originalToTempMap.set(originalPath, tempPath);
  
  return tempPath;
}

/**
 * Process an HQL file - parse imports and transpile to JS
 */
async function processHqlFile(
  originalPath: string,
  tempPath: string,
  tempDir: string,
  originalToTempMap: Map<string, string>,
  processedFiles: Set<string>,
  logger: Logger
): Promise<void> {
  const tempJsPath = tempPath.replace(/\.hql$/, '.js');
  
  try {
    // Read the source (from temp path)
    const source = await Deno.readTextFile(tempPath);
    
    // Process imports in the HQL source
    await processHqlImports(originalPath, tempPath, source, tempDir, originalToTempMap, processedFiles, logger);
    
    // Transpile HQL to JS
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

/**
 * Process imports within an HQL file
 */
async function processHqlImports(
  originalPath: string,
  tempPath: string,
  source: string,
  tempDir: string,
  originalToTempMap: Map<string, string>,
  processedFiles: Set<string>,
  logger: Logger
): Promise<void> {
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
          await processFile(originalImportPath, tempDir, originalToTempMap, processedFiles, logger);
        }
      }
    }
  } catch (e) {
    logger.error(`Error parsing imports in ${tempPath}: ${e.message}`);
  }
}

/**
 * Process a JavaScript file - handle HQL imports and update import statements
 */
async function processJsFile(
  originalPath: string,
  tempPath: string,
  tempDir: string,
  originalToTempMap: Map<string, string>,
  processedFiles: Set<string>,
  logger: Logger
): Promise<void> {
  try {
    // Read the JS file
    const source = await Deno.readTextFile(tempPath);
    
    // Process HQL imports
    const hqlImports = await processHqlImportsInJs(originalPath, tempPath, source, tempDir, originalToTempMap, processedFiles, logger);
    
    // Process JS imports
    await processJsImportsInJs(originalPath, source, tempDir, originalToTempMap, processedFiles, logger);
    
    // Update import paths if needed
    if (hqlImports.length > 0) {
      await updateJsImportPaths(tempPath, source, hqlImports, logger);
    }
  } catch (e) {
    logger.error(`Error processing JS file ${tempPath}: ${e.message}`);
  }
}

/**
 * Process HQL imports within a JS file
 */
async function processHqlImportsInJs(
  originalPath: string,
  tempPath: string,
  source: string,
  tempDir: string,
  originalToTempMap: Map<string, string>,
  processedFiles: Set<string>,
  logger: Logger
): Promise<string[]> {
  const hqlImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.hql)['"]/g;
  let match;
  const imports: string[] = [];
  
  // Find all imports and process them
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
    await processFile(originalImportPath, tempDir, originalToTempMap, processedFiles, logger);
  }
  
  return imports;
}

/**
 * Process JS imports within a JS file
 */
async function processJsImportsInJs(
  originalPath: string,
  source: string,
  tempDir: string,
  originalToTempMap: Map<string, string>,
  processedFiles: Set<string>,
  logger: Logger
): Promise<void> {
  const jsImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.js)['"]/g;
  let match;
  
  while ((match = jsImportRegex.exec(source)) !== null) {
    const importPath = match[1];
    
    // Skip URL imports
    if (isUrl(importPath)) {
      logger.debug(`Found URL JS import: ${importPath} - will be handled by Deno directly`);
      continue;
    }
    
    const originalImportPath = resolve(dirname(originalPath), importPath);
    
    // Process JS imports too
    await processFile(originalImportPath, tempDir, originalToTempMap, processedFiles, logger);
  }
}

/**
 * Update import paths in JS file (convert .hql imports to .js)
 */
async function updateJsImportPaths(
  tempPath: string,
  source: string,
  imports: string[],
  logger: Logger
): Promise<void> {
  if (imports.length === 0) return;
  
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