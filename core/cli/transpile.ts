#!/usr/bin/env deno run -A

import { resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { transpileCLI } from "../src/bundler.ts";
import { globalLogger as logger } from "../src/logger.ts";
import { parseCliOptions, applyCliOptions, CliOptions } from "./utils/cli-options.ts";
import { ErrorPipeline } from "../src/common/error-pipeline.ts";
import { 
  cleanupAllTempFiles, 
  getCacheDir,
  registerExplicitOutput,
  getCacheStats
} from "../src/common/temp-file-tracker.ts";
import { initializeRuntime } from "../src/common/runtime-initializer.ts";

/**
 * Utility to time async phases and log durations
 */
async function timed<T>(
  category: string,
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  logger.startTiming(category, label);
  try {
    return await fn();
  } finally {
    logger.endTiming(category, label);
  }
}

/**
 * Display CLI usage
 */
function printHelp(): void {
  console.error(
    `Usage: deno run -A cli/transpile.ts <input.hql|input.js> [output.js] [options]`
  );
  console.error("\nOptions:");
  console.error("  --run             Execute the transpiled output");
  console.error("  --verbose, -v     Enable verbose logging");
  console.error("  --time            Show timing for each phase");
  console.error("  --print           Print JS to stdout instead of writing to file");
  console.error("  --force           Force recompilation even if file hasn't changed");
  console.error("  --cache-info      Show information about the cache");
  console.error("  --debug           Show detailed error information and stack traces");
  console.error("  --help, -h        Show this help message");
  console.error("\nExamples:");
  console.error("  deno run -A cli/transpile.ts src/file.hql");
  console.error("  deno run -A cli/transpile.ts src/file.hql dist/file.js --time");
  console.error("  deno run -A cli/transpile.ts src/file.hql --print --run");
  console.error("  deno run -A cli/transpile.ts src/file.hql --force");
  console.error("  deno run -A cli/transpile.ts src/file.hql --debug");
}

/**
 * Parse positional args: input and optional output
 */
function parsePaths(
  args: string[]
): { inputPath: string; outputPath?: string } {
  const [inputPath, maybeOutput] = args;
  if (!inputPath) {
    printHelp();
    Deno.exit(1);
  }
  let outputPath: string | undefined;
  if (maybeOutput && !maybeOutput.startsWith("--")) {
    outputPath = maybeOutput;
  }
  return { inputPath, outputPath };
}

/**
 * Show cache statistics
 */
async function showCacheInfo(): Promise<void> {
  const cacheDir = await getCacheDir();
  const stats = await getCacheStats();
  
  console.log("\nHQL Cache Information:");
  console.log(`Cache directory: ${cacheDir}`);
  console.log(`Files in cache: ${stats.files}`);
  console.log(`Cache size: ${(stats.bytes / 1024).toFixed(2)} KB`);
  
  Deno.exit(0);
}

/**
 * Invoke transpiler with error handling
 */
function transpile(
  inputPath: string,
  outputPath: string | undefined,
  opts: CliOptions
): Promise<string> {
  return timed("transpile", "Compile", async () => {
    // Set up cache-aware compilation
    const resolvedInputPath = resolve(inputPath);
    
    // Register output file if provided
    if (outputPath) {
      registerExplicitOutput(outputPath);
    }
    
    // Load source for better error reporting
    let source = '';
    try {
      source = await Deno.readTextFile(resolvedInputPath);
      ErrorPipeline.registerSourceFile(resolvedInputPath, source);
    } catch (err) {
      // If we can't read the file, report and exit immediately
      ErrorPipeline.reportError(err, { filePath: inputPath });
      Deno.exit(1);
    }
    
    try {
      // Use direct execution rather than error pipeline to control error handling ourselves
      return await transpileCLI(resolvedInputPath, outputPath, {
        verbose: opts.verbose,
        showTiming: opts.showTiming,
        skipErrorReporting: true, // We handle errors here
        skipPrimaryErrorReporting: true, // Skip the primary error report in transpileCLI
        force: opts.force
      });
    } catch (error) {
      // Check if this is an enhanced error that has already been reported
      if (error instanceof ErrorPipeline.HQLError && error.reported) {
        // Just exit without further reporting
        Deno.exit(1);
      }
      
      // Create a new error object for unclosed list errors in export statements
      if (error instanceof Error && 
          error.message.toLowerCase().includes("unclosed list") &&
          source) {
        
        // Check for export-specific unclosed list errors
        const lines = source.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim().startsWith('(export') && !lines[i].includes(')')) {
            // Use our error pipeline instead of custom console messages
            const exportError = new ErrorPipeline.ParseError(
              "Missing closing parenthesis in export statement",
              {
                line: i + 1,
                column: lines[i].indexOf('export') + 1,
                filePath: inputPath,
                source,
                originalError: error
              }
            );
            
            // Report through error pipeline
            ErrorPipeline.reportError(exportError, {
              verbose: opts.verbose,
              showCallStack: opts.debug
            });
            
            // Mark the original error as reported
            if (error instanceof ErrorPipeline.HQLError) {
              error.reported = true;
            }
            
            // Don't continue with further error reporting
            Deno.exit(1);
          }
        }
      }
      
      // For all other errors, use the standard error pipeline
      const hqlError = ErrorPipeline.enhanceError(error, {
        filePath: inputPath,
        source
      });
      
      ErrorPipeline.reportError(hqlError, {
        verbose: opts.verbose,
        showCallStack: opts.debug
      });
      
      Deno.exit(1);
    }
  });
}

/**
 * Print bundled JS content
 */
function printJS(bundledPath: string): Promise<void> {
  return timed("transpile", "Output Read", async () => {
    try {
      const content = await Deno.readTextFile(bundledPath);
      console.log(content);
    } catch (err) {
      ErrorPipeline.reportError(err, { filePath: bundledPath });
      Deno.exit(1);
    }
  });
}

/**
 * Dynamically import and execute the JS file
 */
function runJS(
  bundledPath: string,
  inputPath: string,
  source: string
): Promise<void> {
  console.log(`Running: ${bundledPath}`);
  return timed("transpile", "Execute", async () => {
    try {
      await import("file://" + resolve(bundledPath));
    } catch (err) {
      ErrorPipeline.reportError(err, { 
        filePath: inputPath, 
        source 
      });
      Deno.exit(1);
    }
  });
}

/**
 * Clean up all temp files
 */
function cleanup(): Promise<void> {
  return cleanupAllTempFiles().then(() => {
    logger.debug("Cleanup complete");
  });
}

/**
 * Entry point
 */
export async function main(): Promise<void> {
  const args = Deno.args;

  if (!args.length || args.includes("--help") || args.includes("-h")) {
    printHelp();
    Deno.exit(args.length ? 1 : 0);
  }
  
  // Initialize runtime early - this will prevent redundant initializations later
  await initializeRuntime();
  
  // Handle cache info request
  if (args.includes("--cache-info")) {
    await showCacheInfo();
    return;
  }
  
  // Parse options
  const { inputPath, outputPath } = parsePaths(args);
  const opts = parseCliOptions(args);
  
  // Handle debug mode
  if (args.includes("--debug")) {
    opts.debug = true;
    ErrorPipeline.setDebugMode(true);
  }
  
  applyCliOptions(opts);

  // Show cache directory in verbose mode
  if (opts.verbose) {
    const cacheDir = await getCacheDir();
    logger.debug(`Using cache directory: ${cacheDir}`);
  }

  // Load the file and check for common errors before processing
  try {
    const resolvedInputPath = resolve(inputPath);
    const source = await Deno.readTextFile(inputPath);
    ErrorPipeline.registerSourceFile(resolvedInputPath, source);
    
    // Pre-check for common errors like unclosed export statements
    if (source) {
      const lines = source.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('(export') && !lines[i].includes(')')) {
          // Custom formatted error message for clarity
          console.error("Parse Error: Missing closing parenthesis in export statement");
          console.error(`Location: file://${Deno.realPathSync(inputPath)}:${i + 1}:${lines[i].indexOf('export') + 1}`);
          console.error("");
          console.error(`${i} │ ${lines[i-1] || ''}`);
          console.error(`${i+1} │ ${lines[i]}`);
          console.error(`  │ ${' '.repeat(lines[i].indexOf('export'))}^`);
          console.error(`${i+2} │ ${lines[i+1] || ''}`);
          console.error("");
          console.error("Suggestion: Add a closing parenthesis ')' to the end of your export statement.");
          
          if (opts.debug) {
            console.error("\nStack trace:");
            console.error(new Error().stack);
          }
          
          Deno.exit(1);
        }
      }
    }
    
    // Proceed with transpilation
    const bundledPath = await transpile(inputPath, outputPath, opts);

    if (args.includes("--print")) {
      await printJS(bundledPath);
    }
    if (args.includes("--run")) {
      await runJS(bundledPath, inputPath, source);
    }

    logger.logPerformance("transpile", inputPath.split("/").pop()!);
    await cleanup();
  } catch (error) {
    // Handle any errors not caught by transpile
    if (!(error instanceof ErrorPipeline.HQLError && error.reported)) {
      ErrorPipeline.reportError(error, {
        filePath: inputPath,
        verbose: opts.verbose,
        showCallStack: opts.debug
      });
    }
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}