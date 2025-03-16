import { resolve, dirname } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI, OptimizationOptions } from "../src/bundler.ts";
import { Logger } from "../src/logger.ts";
import { MODES } from "./modes.ts";
import { parse } from "../src/transpiler/parser.ts";
import { transpile } from "../src/transformer.ts";
import { isImportNode } from "../src/transpiler/hql_ast.ts";

function printHelp() {
  console.error("Usage: deno run -A cli/run.ts <target.hql|target.js> [options]");
  console.error("\nOptions:");
  console.error("  --verbose         Enable verbose logging");
  console.error("  --performance     Apply aggressive performance optimizations (minify, drop console/debugger, etc.)");
  console.error("  --print           Print final JS output directly in CLI");
  console.error("  --help, -h        Display this help message");
}

/**
 * Preprocesses all HQL imports by creating temporary JS files
 * before Deno tries to validate the imports.
 */
async function preprocessHqlImports(entryPath: string, logger: Logger): Promise<void> {
  logger.debug(`Preprocessing HQL imports for entry: ${entryPath}`);
  
  // Keep track of processed files to avoid infinite recursion
  const processed = new Set<string>();
  
  // Process a file and its dependencies
  async function processFile(filePath: string): Promise<void> {
    if (processed.has(filePath)) {
      return;
    }
    processed.add(filePath);
    
    // Check file extension
    if (filePath.endsWith('.hql')) {
      // For HQL files: transpile to JS
      const jsOutputPath = filePath.replace(/\.hql$/, '.js');
      logger.debug(`Transpiling HQL file: ${filePath} -> ${jsOutputPath}`);
      
      try {
        const source = await Deno.readTextFile(filePath);
        const transpiled = await transpile(source, filePath, { bundle: false, verbose: logger.enabled });
        await Deno.writeTextFile(jsOutputPath, transpiled);
        
        // Find imports in the HQL file and process them
        const ast = parse(source);
        for (const node of ast) {
          if (isImportNode(node)) {
            try {
              const importPath = extractImportPath(node);
              if (importPath) {
                const importFullPath = resolve(dirname(filePath), importPath);
                await processFile(importFullPath);
              }
            } catch (e) {
              logger.error(`Error processing import in ${filePath}: ${e.message}`);
            }
          }
        }
      } catch (e) {
        logger.error(`Error transpiling ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    } 
    else if (filePath.endsWith('.js')) {
      // For JS files: find HQL imports and process them
      try {
        const source = await Deno.readTextFile(filePath);
        
        // Find HQL imports
        const hqlImportRegex = /import\s+.*\s+from\s+['"]([^'"]+\.hql)['"]/g;
        let match;
        const imports = [];
        
        while ((match = hqlImportRegex.exec(source)) !== null) {
          const importPath = match[1];
          imports.push(importPath);
          
          // Process each imported HQL file
          const importFullPath = resolve(dirname(filePath), importPath);
          await processFile(importFullPath);
        }
        
        // If we found HQL imports, modify the JS file
        if (imports.length > 0) {
          logger.debug(`Found ${imports.length} HQL imports in JS file: ${filePath}`);
          
          // Create a modified version with .js instead of .hql
          let modified = source;
          for (const importPath of imports) {
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
      } catch (e) {
        logger.error(`Error processing JS file ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  
  // Start processing from the entry point
  await processFile(entryPath);
  logger.debug("Preprocessing complete");
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

// Helper function to escape special regex characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper to restore original JS files after running
async function restoreOriginalFiles(logger: Logger): Promise<void> {
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

async function runModule(): Promise<void> {
  // Check if help is requested
  if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
    printHelp();
    Deno.exit(0);
  }

  // Filter non-option arguments (assume they are file paths)
  const args = Deno.args.filter((arg) => !arg.startsWith("--"));
  const verbose = Deno.args.includes("--verbose");
  const performance = Deno.args.includes("--performance");
  const printOutput = Deno.args.includes("--print");
  const logger = new Logger(verbose);

  if (args.length < 1) {
    printHelp();
    Deno.exit(1);
  }

  const inputPath = resolve(args[0]);
  logger.log(`Processing entry: ${inputPath}`);

  try {
    // CRITICAL: Preprocess HQL imports before bundling
    await preprocessHqlImports(inputPath, logger);
    
    // Create a temporary directory so that the output file doesn't conflict with any existing file.
    const tempDir = await Deno.makeTempDir();
    const tempOutput = resolve(tempDir, "bundled.js");

    // Prepare optimization options.
    let optimizationOptions: OptimizationOptions = {};
    if (performance) {
      logger.log("Aggressive performance optimizations enabled.");
      optimizationOptions = { ...MODES.performance };
    }

    // Transpile and bundle the input file.
    const bundledPath = await transpileCLI(inputPath, tempOutput, { verbose, ...optimizationOptions });

    if (printOutput) {
      // Print the final JS output directly to the CLI.
      const finalOutput = await Deno.readTextFile(bundledPath);
      console.log(finalOutput);
    }
    
    logger.log(`Running bundled output: ${bundledPath}`);
    // Dynamically import the bundled module.
    await import("file://" + resolve(bundledPath));

    // Clean up the temporary directory.
    await Deno.remove(tempDir, { recursive: true });
    logger.log(`Cleaned up temporary directory: ${tempDir}`);
    
    // Restore original JS files
    await restoreOriginalFiles(logger);
  } catch (error) {
    logger.error(`Error during processing: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

if (import.meta.main) {
  runModule().catch((error) => {
    console.error("Error:", error);
    Deno.exit(1);
  });
}