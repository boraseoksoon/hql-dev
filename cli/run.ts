import { resolve, dirname, basename, join } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI, OptimizationOptions } from "../src/bundler.ts";
import { Logger } from "../src/logger.ts";
import { MODES } from "./modes.ts";
import { parse } from "../src/transpiler/parser.ts";
import { transpile } from "../src/transformer.ts";
import { isImportNode, extractImportPath } from "../src/transpiler/hql_ast.ts";
import { cleanupDir } from "../src/platform/platform.ts";
import { isUrl, escapeRegExp } from "../src/utils.ts";
import { CurrentPlatform as platform } from "../src/platform/platform.ts";

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
 * Preprocess HQL imports in a temporary directory.
 */
async function preprocessHqlImports(entryPath: string, logger: Logger): Promise<string> {
  logger.debug(`Preprocessing HQL imports for entry: ${entryPath}`);
  
  // Create a temp directory via platform abstraction (assume makeTempDir accepts a prefix)
  const tempDir = await platform.makeTempDir("hql_run_");
  logger.debug(`Created temporary workspace: ${tempDir}`);
  
  const originalToTempMap = new Map<string, string>();
  const processedFiles = new Set<string>();
  
  // Copy entry file to temp dir using platform.copyFile
  const entryName = basename(entryPath);
  const tempEntryPath = join(tempDir, entryName);
  await platform.copyFile(entryPath, tempEntryPath);
  logger.debug(`Copied entry file to: ${tempEntryPath}`);
  originalToTempMap.set(entryPath, tempEntryPath);
  
  await processFile(entryPath, tempDir, originalToTempMap, processedFiles, logger);
  
  logger.debug("Preprocessing complete - all imports handled");
  return tempEntryPath;
}

/**
 * Process a file and its imports.
 */
async function processFile(
  originalPath: string, 
  tempDir: string,
  originalToTempMap: Map<string, string>,
  processedFiles: Set<string>,
  logger: Logger,
): Promise<void> {
  if (processedFiles.has(originalPath)) return;
  processedFiles.add(originalPath);
  
  // Skip processing for URL imports using the enhanced isUrl function
  if (isUrl(originalPath)) {
    logger.debug(`Skipping preprocessing for special import path: ${originalPath}`);
    return;
  }
  
  const tempPath = await createOrGetTempPath(originalPath, tempDir, originalToTempMap, logger);
  
  if (originalPath.endsWith('.hql')) {
    await processHqlFile(originalPath, tempPath, tempDir, originalToTempMap, processedFiles, logger);
  } else if (originalPath.endsWith('.js')) {
    await processJsFile(originalPath, tempPath, tempDir, originalToTempMap, processedFiles, logger);
  }
}

/**
 * Create or retrieve a temporary path for a file.
 */
async function createOrGetTempPath(
  originalPath: string,
  tempDir: string,
  originalToTempMap: Map<string, string>,
  logger: Logger
): Promise<string> {
  if (originalToTempMap.has(originalPath)) return originalToTempMap.get(originalPath)!;
  
  const baseName = basename(originalPath);
  const tempPath = join(tempDir, baseName);
  
  await platform.copyFile(originalPath, tempPath);
  logger.debug(`Copied ${originalPath} to ${tempPath}`);
  originalToTempMap.set(originalPath, tempPath);
  
  return tempPath;
}

/**
 * Process an HQL file: handle imports and transpile to JS.
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
    const source = await platform.readTextFile(tempPath);
    await processHqlImports(originalPath, tempPath, source, tempDir, originalToTempMap, processedFiles, logger);
    
    const transpiled = await transpile(source, tempPath, { 
      bundle: false, 
      verbose: logger.enabled 
    });
    
    await platform.writeTextFile(tempJsPath, transpiled);
    logger.debug(`Transpiled ${tempPath} to ${tempJsPath}`);
    
    generatedTempFiles.add(tempJsPath);
  } catch (e) {
    logger.error(`Error processing HQL file ${tempPath}: ${e.message}`);
  }
}

/**
 * Process imports within an HQL file.
 */
/**
 * Process imports within an HQL file.
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
          if (isUrl(importPath)) {
            logger.debug(`Found special import path: ${importPath} - will be handled directly`);
            continue;
          }
          
          // Process normal file imports
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
 * Process a JavaScript file: handle HQL and JS imports.
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
    const source = await platform.readTextFile(tempPath);
    const hqlImports = await processHqlImportsInJs(originalPath, tempPath, source, tempDir, originalToTempMap, processedFiles, logger);
    await processJsImportsInJs(originalPath, source, tempDir, originalToTempMap, processedFiles, logger);
    
    if (hqlImports.length > 0) {
      await updateJsImportPaths(tempPath, source, hqlImports, logger);
    }
  } catch (e) {
    logger.error(`Error processing JS file ${tempPath}: ${e.message}`);
  }
}

/**
 * Process HQL imports in a JS file.
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
  
  while ((match = hqlImportRegex.exec(source)) !== null) {
    const importPath = match[1];
    imports.push(importPath);
    
    if (isUrl(importPath)) {
      logger.debug(`Found URL import in JS file: ${importPath} - will be handled by Deno directly`);
      continue;
    }
    
    const originalImportPath = resolve(dirname(originalPath), importPath);
    await processFile(originalImportPath, tempDir, originalToTempMap, processedFiles, logger);
  }
  
  return imports;
}

/**
 * Process JS imports in a JS file.
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
    
    if (isUrl(importPath)) {
      logger.debug(`Found URL JS import: ${importPath} - will be handled by Deno directly`);
      continue;
    }
    
    const originalImportPath = resolve(dirname(originalPath), importPath);
    await processFile(originalImportPath, tempDir, originalToTempMap, processedFiles, logger);
  }
}

/**
 * Update import paths in a JS file (convert .hql to .js).
 */
async function updateJsImportPaths(
  tempPath: string,
  source: string,
  imports: string[],
  logger: Logger
): Promise<void> {
  if (imports.length === 0) return;
  
  logger.debug(`Fixing ${imports.length} HQL imports in JS file: ${tempPath}`);
  
  let modified = source;
  for (const importPath of imports) {
    if (!isUrl(importPath)) {
      const jsImportPath = importPath.replace(/\.hql$/, '.js');
      modified = modified.replace(
        new RegExp(`(['"])${escapeRegExp(importPath)}(['"])`, 'g'),
        `$1${jsImportPath}$2`
      );
    }
  }
  
  await platform.writeTextFile(tempPath, modified);
  logger.debug(`Updated imports in ${tempPath}`);
}

/**
 * Main module execution.
 */
async function runModule(): Promise<void> {
  // Use platform abstraction to get command-line arguments
  const args = platform.getArgs();
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    platform.exit(0);
  }

  const nonOptionArgs = args.filter(arg => !arg.startsWith("--"));
  const verbose = args.includes("--verbose");
  const performance = args.includes("--performance");
  const printOutput = args.includes("--print");
  const keepJs = args.includes("--keep-js");
  const logger = new Logger(verbose);

  if (nonOptionArgs.length < 1) {
    printHelp();
    platform.exit(1);
  }

  const inputPath = resolve(nonOptionArgs[0]);
  logger.log(`Processing entry: ${inputPath}`);

  let tempDir: string | null = null;
  
  try {
    const tempEntryPath = await preprocessHqlImports(inputPath, logger);
    tempDir = dirname(tempEntryPath);
    
    const tempOutput = join(tempDir, "bundled.js");

    const optimizationOptions: OptimizationOptions = performance ? { ...MODES.performance } : {};

    logger.log(`Bundling entry file: ${tempEntryPath}`);
    const bundledPath = await transpileCLI(tempEntryPath, tempOutput, { 
      verbose, 
      ...optimizationOptions
    });
    
    if (printOutput) {
      const finalOutput = await platform.readTextFile(bundledPath);
      console.log(finalOutput);
    }
    
    logger.log(`Running bundled output: ${bundledPath}`);
    await import("file://" + resolve(bundledPath));
    
    if (!keepJs && tempDir) {
      await cleanupDir(tempDir, logger); // cleanupDir already uses platform abstraction internally
      tempDir = null;
    } else if (keepJs) {
      logger.log(`Keeping temporary files in: ${tempDir}`);
    }
  } catch (error) {
    logger.error(`Error during processing: ${error instanceof Error ? error.message : String(error)}`);
    
    if (tempDir && !keepJs) {
      await cleanupDir(tempDir, logger);
    }
    
    throw error;
  }
}

if (import.meta.main) {
  runModule().catch((error) => {
    console.error("Error:", error);
    platform.exit(1);
  });
}
