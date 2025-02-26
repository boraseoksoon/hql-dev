// cli/compile.ts
import { compile as compileSource, compileFile, writeOutput, CompilerOptions, CompilerResult } from "../src/compiler.ts";
import { dirname } from "https://deno.land/std@0.170.0/path/mod.ts";

// CLI-specific options that extend the compiler options
interface CLICompileOptions extends CompilerOptions {
  /**
   * The output file path.
   */
  outputPath?: string;
  
  /**
   * Log level:
   * - 0: errors only
   * - 1: warnings
   * - 2: info
   * - 3: verbose
   * Default: 1
   */
  logLevel?: number;
  
  /**
   * Whether to watch for file changes and recompile automatically.
   * Default: false
   */
  watch?: boolean;
}

// Simple logger factory based on the log level
function createLogger(logLevel: number) {
  return (level: number, message: string) => {
    if (level <= logLevel) {
      console.log(message);
    }
  };
}

// Main compile function that ties all steps together
export async function compile(inputPath: string, options: CLICompileOptions = {}): Promise<CompilerResult> {
  const startTime = performance.now();
  const logLevel = options.logLevel ?? 1;
  const log = createLogger(logLevel);
  const outputPath = options.outputPath ?? inputPath.replace(/\.hql$/, options.format === 'ts' ? '.ts' : '.js');
  
  try {
    log(2, `Compiling ${inputPath} to ${outputPath}`);
    
    // Compile the file
    const result = await compileFile(inputPath, {
      format: options.format,
      sourceMap: options.sourceMap,
      declaration: options.declaration,
      optimizationLevel: options.optimizationLevel,
      typeCheck: options.typeCheck,
      bundle: options.bundle,
      target: options.target,
      module: options.module
    });
    
    // Write the output
    await writeOutput(result, outputPath);
    
    // Log results
    log(2, `Source size: ${result.stats.inputSize} bytes`);
    log(2, `Output size: ${result.stats.outputSize} bytes`);
    log(3, `Parse time: ${result.stats.parseTime.toFixed(2)}ms`);
    log(3, `IR generation time: ${result.stats.irGenTime.toFixed(2)}ms`);
    log(3, `Code generation time: ${result.stats.codeGenTime.toFixed(2)}ms`);
    log(2, `Successfully compiled ${inputPath} -> ${outputPath}`);
    log(2, `Compilation completed in ${result.stats.totalTime.toFixed(2)}ms`);
    
    // Display warnings if any
    for (const warning of result.warnings) {
      log(1, `Warning: ${warning}`);
    }
    
    return result;
  } catch (error) {
    console.error(`Compilation failed: ${error.message}`);
    throw error;
  }
}

// Simple watch function implementation
async function watchFile(inputPath: string, options: CLICompileOptions): Promise<void> {
  const log = createLogger(options.logLevel ?? 1);
  log(2, `Watching ${inputPath} for changes...`);
  
  try {
    // Initial compilation
    await compile(inputPath, options);
    
    // Set up file watcher
    const watcher = Deno.watchFs(inputPath);
    
    for await (const event of watcher) {
      if (event.kind === 'modify') {
        try {
          log(2, `File changed, recompiling...`);
          await compile(inputPath, options);
        } catch (error) {
          console.error(`Compilation failed: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.error(`Watch error: ${error.message}`);
    Deno.exit(1);
  }
}

// Command-line execution when run directly
if (import.meta.main) {
  const args = Deno.args;
  
  if (args.length < 1) {
    console.error("Usage: deno run -A compile.ts <input.hql> [output.js] [options]");
    console.error("Options:");
    console.error("  --format=ts|js    Output format (default: js)");
    console.error("  --source-map      Generate source map");
    console.error("  --declaration     Generate declaration file (for ts format)");
    console.error("  --optimize=0|1|2  Optimization level (default: 1)");
    console.error("  --type-check      Include runtime type checking");
    console.error("  --bundle          Bundle all imports into a single file");
    console.error("  --target=<ver>    Target JavaScript version (default: es2020)");
    console.error("  --module=<type>   Module system (default: esm)");
    console.error("  --watch           Watch for file changes and recompile");
    console.error("  --verbose, -v     Verbose logging");
    Deno.exit(1);
  }
  
  const inputPath = args[0];
  
  // Parse options
  const options: CLICompileOptions = {};
  
  // Check if the second argument is an output path (no -- prefix)
  if (args.length > 1 && !args[1].startsWith('--')) {
    options.outputPath = args[1];
  }
  
  // Parse the remaining arguments
  for (const arg of args) {
    if (arg === '--verbose' || arg === '-v') {
      options.logLevel = 3;
    } else if (arg.startsWith('--format=')) {
      const format = arg.split('=')[1];
      if (format === 'ts' || format === 'js') {
        options.format = format;
      } else {
        console.error(`Invalid format: ${format}. Must be 'ts' or 'js'.`);
        Deno.exit(1);
      }
    } else if (arg === '--source-map') {
      options.sourceMap = true;
    } else if (arg === '--declaration') {
      options.declaration = true;
    } else if (arg.startsWith('--optimize=')) {
      const level = parseInt(arg.split('=')[1]);
      if (level >= 0 && level <= 2) {
        options.optimizationLevel = level as 0 | 1 | 2;
      } else {
        console.error(`Invalid optimization level: ${level}. Must be 0, 1, or 2.`);
        Deno.exit(1);
      }
    } else if (arg === '--type-check') {
      options.typeCheck = true;
    } else if (arg === '--bundle') {
      options.bundle = true;
    } else if (arg.startsWith('--target=')) {
      const target = arg.split('=')[1];
      options.target = target as any;
    } else if (arg.startsWith('--module=')) {
      const module = arg.split('=')[1];
      if (['esm', 'commonjs', 'umd', 'amd'].includes(module)) {
        options.module = module as any;
      } else {
        console.error(`Invalid module type: ${module}. Must be 'esm', 'commonjs', 'umd', or 'amd'.`);
        Deno.exit(1);
      }
    } else if (arg === '--watch') {
      options.watch = true;
    }
  }
  
  // Run the compiler (or watcher)
  if (options.watch) {
    watchFile(inputPath, options).catch(() => Deno.exit(1));
  } else {
    compile(inputPath, options).catch(() => Deno.exit(1));
  }
}

export default compile;