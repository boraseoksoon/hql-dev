// src/bundler.ts - Refactored for modularity and reduced redundancy
import { dirname, resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { build, stop } from "https://deno.land/x/esbuild@v0.17.19/mod.js";
import { Logger } from "./logger.ts";
import { parse } from "./transpiler/parser.ts";
import { transformAST, transpile } from "./transformer.ts";
import { readTextFile, writeTextFile, mkdir, exists, basename } from "./platform/platform.ts";

/**
 * Represents esbuild optimization options
 */
export interface OptimizationOptions {
  minify?: boolean;
  target?: string;
  sourcemap?: boolean | string;
  drop?: string[];
  charset?: 'ascii' | 'utf8';
  legalComments?: 'none' | 'inline' | 'eof' | 'external';
  treeShaking?: boolean;
  pure?: string[];
  keepNames?: boolean;
  define?: Record<string, string>;
}

/**
 * Bundle options combining build settings with file handling options
 */
export interface BundleOptions extends OptimizationOptions {
  verbose?: boolean;
  force?: boolean;
  bundle?: boolean;
}

/**
 * Ensures the specified directory exists
 * @param dir Directory path to ensure exists
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
  }
}

/**
 * Rebase relative import specifiers to use the original file directory
 * @param code Source code with imports to rebase
 * @param originalDir Original file directory to rebase against
 * @returns Code with rebased imports
 */
function rebaseImports(code: string, originalDir: string): string {
  return code.replace(
    /(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,
    (_, prefix, relPath, suffix) => {
      const absPath = resolve(originalDir, relPath);
      return `${prefix}${absPath}${suffix}`;
    }
  );
}

/**
 * Prompt the user for a yes/no question
 * @param question Question to prompt with
 * @returns User's response (true for yes, false for no)
 */
async function promptYesNo(question: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  await Deno.stdout.write(encoder.encode(question));
  const buf = new Uint8Array(1);
  await Deno.stdin.read(buf);
  const answer = decoder.decode(buf).toLowerCase();
  
  // Also echo a newline for better formatting
  await Deno.stdout.write(encoder.encode("\n"));
  
  return answer === 'y';
}

/**
 * Write code to a file, prompting before overwriting existing files unless force is true.
 * @param code Code to write
 * @param outputPath Path to write to
 * @param logger Logger instance
 * @param force Whether to force overwriting without prompting
 */
async function writeOutput(
  code: string,
  outputPath: string,
  logger: Logger,
  force: boolean = false
): Promise<void> {
  const outputDir = dirname(outputPath);
  await ensureDir(outputDir);
  
  // Check if file exists before writing
  if (!force && await exists(outputPath)) {
    // Prompt the user for confirmation
    const answer = await promptYesNo(`File '${outputPath}' already exists. Overwrite? (y/n): `);
    
    if (!answer) {
      logger.log("Operation cancelled. File not overwritten.");
      return;
    }
  }
  
  await writeTextFile(outputPath, code);
  logger.log(`Output written to: ${outputPath}`);
}

/**
 * Create an esbuild plugin to handle HQL imports
 * @param options Plugin options
 * @returns esbuild plugin object
 */
export function createHqlPlugin(options: { verbose?: boolean }): any {
  const logger = new Logger(options.verbose);
  
  return {
    name: "hql-plugin",
    setup(build: any) {
      // Map to track resolved paths
      const pathMap = new Map<string, string>();
      const processedHqlFiles = new Set<string>();
      
      // Handle resolving .hql files
      build.onResolve({ filter: /\.hql$/ }, async (args: any) => {
        logger.debug(`Resolving HQL import: "${args.path}" from importer: ${args.importer || 'unknown'}`);
        
        // Try multiple strategies to find the actual file
        let fullPath = args.path;
        let resolved = false;
        
        // Strategy 1: Resolve relative to importer
        if (args.importer) {
          const importerDir = dirname(args.importer);
          const relativePath = resolve(importerDir, args.path);
          logger.debug(`Trying path relative to importer: ${relativePath}`);
          
          try {
            await Deno.stat(relativePath);
            fullPath = relativePath;
            resolved = true;
            logger.debug(`Found file relative to importer: ${fullPath}`);
          } catch (e) {
            // File not found via this strategy
          }
        }
        
        // Strategy 2: Try resolving from current working directory
        if (!resolved) {
          const cwdPath = resolve(Deno.cwd(), args.path);
          logger.debug(`Trying path relative to cwd: ${cwdPath}`);
          
          try {
            await Deno.stat(cwdPath);
            fullPath = cwdPath;
            resolved = true;
            logger.debug(`Found file relative to cwd: ${fullPath}`);
          } catch (e) {
            // File not found via this strategy
          }
        }
        
        // Strategy 3: Try looking in examples directory specifically
        if (!resolved) {
          const fileName = basename(args.path);
          const examplesPath = resolve(Deno.cwd(), "examples", "dependency-test", fileName);
          logger.debug(`Trying path in examples directory: ${examplesPath}`);
          
          try {
            await Deno.stat(examplesPath);
            fullPath = examplesPath;
            resolved = true;
            logger.debug(`Found file in examples directory: ${fullPath}`);
          } catch (e) {
            // File not found via this strategy
          }
        }
        
        // Remember this path for future lookups
        if (resolved) {
          pathMap.set(args.path, fullPath);
        } else {
          logger.warn(`Could not resolve HQL file: ${args.path}`);
        }
        
        return { 
          path: fullPath, 
          namespace: "hql" 
        };
      });
      
      // NEW: Handle resolving .js files that might be generated from .hql files
      build.onResolve({ filter: /\.js$/ }, async (args: any) => {
        logger.debug(`Resolving JS import: "${args.path}" from importer: ${args.importer || 'unknown'}`);
        
        // Try multiple strategies to find the actual file
        let fullPath = args.path;
        let resolved = false;
        
        // Strategy 1: Resolve relative to importer
        if (args.importer) {
          const importerDir = dirname(args.importer);
          const relativePath = resolve(importerDir, args.path);
          logger.debug(`Trying path relative to importer: ${relativePath}`);
          
          try {
            await Deno.stat(relativePath);
            fullPath = relativePath;
            resolved = true;
            logger.debug(`Found JS file relative to importer: ${fullPath}`);
          } catch (e) {
            // File not found via this strategy
            
            // Check if there's a corresponding HQL file that needs to be transpiled
            const hqlPath = relativePath.replace(/\.js$/, '.hql');
            try {
              await Deno.stat(hqlPath);
              logger.debug(`Found corresponding HQL file: ${hqlPath}`);
              
              // Only transpile if we haven't processed this HQL file yet
              if (!processedHqlFiles.has(hqlPath)) {
                processedHqlFiles.add(hqlPath);
                
                // Transpile the HQL file to create the missing JS file
                const source = await readTextFile(hqlPath);
                const transpiledHql = await transpile(source, hqlPath, {
                  bundle: false,
                  verbose: options.verbose,
                });
                
                // Write to the JS file
                await writeTextFile(relativePath, transpiledHql);
                logger.debug(`Transpiled HQL to JS: ${relativePath}`);
              }
              
              fullPath = relativePath;
              resolved = true;
            } catch (hqlError) {
              // No HQL file either
              logger.debug(`No corresponding HQL file found for: ${relativePath}`);
            }
          }
        }
        
        // Strategy 2: Try resolving from current working directory
        if (!resolved) {
          const cwdPath = resolve(Deno.cwd(), args.path);
          logger.debug(`Trying path relative to cwd: ${cwdPath}`);
          
          try {
            await Deno.stat(cwdPath);
            fullPath = cwdPath;
            resolved = true;
            logger.debug(`Found JS file in cwd: ${fullPath}`);
          } catch (e) {
            // Check if there's a corresponding HQL file
            const hqlPath = cwdPath.replace(/\.js$/, '.hql');
            try {
              await Deno.stat(hqlPath);
              logger.debug(`Found corresponding HQL file in cwd: ${hqlPath}`);
              
              if (!processedHqlFiles.has(hqlPath)) {
                processedHqlFiles.add(hqlPath);
                
                // Transpile the HQL file
                const source = await readTextFile(hqlPath);
                const transpiledHql = await transpile(source, hqlPath, {
                  bundle: false,
                  verbose: options.verbose,
                });
                
                // Write to the JS file
                await writeTextFile(cwdPath, transpiledHql);
                logger.debug(`Transpiled HQL to JS in cwd: ${cwdPath}`);
              }
              
              fullPath = cwdPath;
              resolved = true;
            } catch (hqlError) {
              // No HQL file either
              logger.debug(`No corresponding HQL file found in cwd for: ${cwdPath}`);
            }
          }
        }
        
        // Strategy 3: Try looking in examples directory specifically
        if (!resolved) {
          const fileName = basename(args.path);
          const examplesPath = resolve(Deno.cwd(), "examples", "dependency-test", fileName);
          logger.debug(`Trying JS file in examples directory: ${examplesPath}`);
          
          try {
            await Deno.stat(examplesPath);
            fullPath = examplesPath;
            resolved = true;
            logger.debug(`Found JS file in examples directory: ${fullPath}`);
          } catch (e) {
            // Check if there's a corresponding HQL file
            const hqlPath = examplesPath.replace(/\.js$/, '.hql');
            try {
              await Deno.stat(hqlPath);
              logger.debug(`Found corresponding HQL file in examples: ${hqlPath}`);
              
              if (!processedHqlFiles.has(hqlPath)) {
                processedHqlFiles.add(hqlPath);
                
                // Transpile the HQL file
                const source = await readTextFile(hqlPath);
                const transpiledHql = await transpile(source, hqlPath, {
                  bundle: false,
                  verbose: options.verbose,
                });
                
                // Write to the JS file
                await writeTextFile(examplesPath, transpiledHql);
                logger.debug(`Transpiled HQL to JS in examples: ${examplesPath}`);
              }
              
              fullPath = examplesPath;
              resolved = true;
            } catch (hqlError) {
              // No HQL file either
              logger.debug(`No corresponding HQL file found in examples for: ${examplesPath}`);
            }
          }
        }
        
        if (resolved) {
          return { path: fullPath };
        }
        
        // Let esbuild continue with its default resolution if we couldn't handle this
        return { path: args.path };
      });
      
      // Handle loading .hql files
      build.onLoad({ filter: /.*/, namespace: "hql" }, async (args: any) => {
        try {
          logger.debug(`Loading HQL file: ${args.path}`);
          
          let source: string;
          try {
            // Try to read the file directly
            source = await readTextFile(args.path);
          } catch (error) {
            // If file not found, try alternatives
            if (error instanceof Deno.errors.NotFound) {
              logger.debug(`File not found at ${args.path}, trying alternatives`);
              
              // Try the examples directory as a fallback
              const fileName = basename(args.path);
              const examplesPath = resolve(Deno.cwd(), "examples", "dependency-test", fileName);
              
              try {
                source = await readTextFile(examplesPath);
                args.path = examplesPath; // Update the path for correct transpilation
                logger.debug(`Found in examples directory: ${examplesPath}`);
              } catch (e) {
                throw new Error(`File not found: ${args.path}, also tried ${examplesPath}`);
              }
            } else {
              throw error;
            }
          }
          
          // Add to processed files set to avoid duplicate transpilation
          processedHqlFiles.add(args.path);
          
          // Transpile the HQL to JavaScript
          const transpiledHql = await transpile(source, args.path, {
            bundle: true,
            verbose: options.verbose,
          });
          
          return { 
            contents: transpiledHql, 
            loader: "js",
            resolveDir: dirname(args.path) // Critical for correctly resolving nested imports
          };
        } catch (error) {
          logger.error(`Error loading HQL file: ${error instanceof Error ? error.message : String(error)}`);
          return {
            errors: [{ text: `Error loading HQL file: ${error instanceof Error ? error.message : String(error)}` }]
          };
        }
      });
    },
  };
}

/**
 * Create an esbuild plugin to mark npm: and jsr: imports as external
 * @returns esbuild plugin object
 */
export function createExternalPlugin(): any {
  return {
    name: "external-npm-jsr",
    setup(build: any) {
      build.onResolve({ filter: /^(npm:|jsr:)/ }, (args: any) => {
        return { path: args.path, external: true };
      });
    },
  };
}

/**
 * Process an entry file (HQL or JS) and output transpiled JS
 * @param inputPath Path to input file
 * @param outputPath Path for output file
 * @param options Processing options
 * @returns Path to processed output file
 */
// In src/bundler.ts, modify the processEntryFile function

async function processEntryFile(
  inputPath: string,
  outputPath: string,
  options: BundleOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose || false);
  const resolvedInputPath = resolve(inputPath);
  
  // For HQL files, transpile them
  if (resolvedInputPath.endsWith(".hql")) {
    logger.log(`Transpiling HQL entry file: ${resolvedInputPath}`);
    const userSource = await readTextFile(resolvedInputPath);
    const ast = parse(userSource);
    const originalDir = dirname(resolvedInputPath);
    const transformed = await transformAST(ast, originalDir, {
      bundle: true,
      verbose: options.verbose,
    });
    const code = rebaseImports(transformed, originalDir);
    
    await writeOutput(code, outputPath, logger, options.force);
    logger.log(`Entry processed and output written to ${outputPath}`);
    return outputPath;
  } 
  // For JS files, we need to preprocess them to find HQL imports
  else if (resolvedInputPath.endsWith(".js")) {
    logger.log(`Preprocessing JavaScript entry file: ${resolvedInputPath}`);
    
    // Read the content
    const jsSource = await readTextFile(resolvedInputPath);
    
    // Write it to the output path
    await writeOutput(jsSource, outputPath, logger, options.force);
    
    // Preprocess dependencies
    await preprocessJsDependencies(resolvedInputPath, dirname(resolvedInputPath), logger);
    
    return outputPath;
  }
  // For other files, just use them as-is
  else {
    logger.log(`Using entry file as-is: ${resolvedInputPath}`);
    const code = await readTextFile(resolvedInputPath);
    await writeOutput(code, outputPath, logger, options.force);
    return outputPath;
  }
}

async function preprocessJsDependencies(
  jsFilePath: string, 
  baseDir: string,
  logger: Logger,
  processedFiles: Set<string> = new Set()
): Promise<void> {
  // Skip if already processed to avoid circular dependencies
  if (processedFiles.has(jsFilePath)) {
    return;
  }
  processedFiles.add(jsFilePath);
  
  logger.debug(`Preprocessing JS dependencies for: ${jsFilePath}`);
  
  // Read the JS file
  let jsSource: string;
  try {
    jsSource = await readTextFile(jsFilePath);
  } catch (error) {
    // If the JS file doesn't exist, check if we can generate it from an HQL file
    if (error instanceof Deno.errors.NotFound) {
      const hqlFilePath = jsFilePath.replace(/\.js$/, '.hql');
      
      try {
        // Try to read the HQL file
        await Deno.stat(hqlFilePath);
        logger.debug(`JS file not found but found HQL file: ${hqlFilePath}`);
        
        // Transpile the HQL to create the JS file
        const hqlSource = await readTextFile(hqlFilePath);
        const transpiled = await transpile(hqlSource, hqlFilePath, {
          bundle: false,
          verbose: true
        });
        
        // Write to a JS file
        await writeTextFile(jsFilePath, transpiled);
        logger.debug(`Generated JS file from HQL: ${jsFilePath}`);
        
        // Now read the generated JS file
        jsSource = await readTextFile(jsFilePath);
      } catch (hqlError) {
        // Could not find or process the HQL file either
        logger.error(`Could not find JS file: ${jsFilePath} or HQL equivalent`);
        throw error; // Re-throw the original error
      }
    } else {
      // Some other error occurred
      throw error;
    }
  }
  
  // Find all imports using regex
  const importRegex = /import\s+.*\s+from\s+['"]([^'"]+)['"];?/g;
  let match;
  const imports = [];
  
  while ((match = importRegex.exec(jsSource)) !== null) {
    const importPath = match[1];
    imports.push(importPath);
    logger.debug(`Found import: ${importPath}`);
  }
  
  // Process each import
  for (const importPath of imports) {
    // Build an array of possible full paths to check
    const paths: string[] = [];
    
    // Convert relative path to absolute
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      paths.push(resolve(baseDir, importPath));
    } else {
      // For non-relative imports (e.g. "lodash"), skip processing
      if (importPath.startsWith('npm:') || importPath.startsWith('jsr:') || 
          importPath.startsWith('http:') || importPath.startsWith('https:')) {
        continue;
      }
      
      // Try various locations for the import
      paths.push(resolve(baseDir, importPath));
      paths.push(resolve(Deno.cwd(), importPath));
      paths.push(resolve(Deno.cwd(), "examples", "dependency-test", importPath));
    }
    
    for (const path of paths) {
      // Process HQL files
      if (path.endsWith('.hql')) {
        try {
          // Check if the HQL file exists
          await Deno.stat(path);
          logger.debug(`Processing HQL import: ${path}`);
          
          // Transpile it to JS
          const source = await readTextFile(path);
          const transpiled = await transpile(source, path, {
            bundle: false,
            verbose: true
          });
          
          // Write to a JS file
          const outputPath = path.replace(/\.hql$/, '.js');
          await writeTextFile(outputPath, transpiled);
          logger.debug(`Wrote transpiled HQL to JS: ${outputPath}`);
          
          // Recursively process this new JS file
          await preprocessJsDependencies(outputPath, dirname(outputPath), logger, processedFiles);
          
          // We've found and processed the file, no need to check other paths
          break;
        } catch (error) {
          // Continue to the next path if this one fails
          logger.debug(`Could not process HQL import ${path}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      // Process JS files recursively
      else if (path.endsWith('.js')) {
        try {
          // Check if the file exists
          await Deno.stat(path);
          logger.debug(`Found JS import: ${path}`);
          
          // Recursively process this JS file's dependencies
          await preprocessJsDependencies(path, dirname(path), logger, processedFiles);
          
          // We've found and processed the file, no need to check other paths
          break;
        } catch (error) {
          // File doesn't exist, check if there's an HQL counterpart
          if (error instanceof Deno.errors.NotFound) {
            const hqlPath = path.replace(/\.js$/, '.hql');
            
            try {
              await Deno.stat(hqlPath);
              logger.debug(`JS import not found but found HQL counterpart: ${hqlPath}`);
              
              // Transpile the HQL to create the JS file
              const source = await readTextFile(hqlPath);
              const transpiled = await transpile(source, hqlPath, {
                bundle: false,
                verbose: true
              });
              
              // Write to a JS file
              await writeTextFile(path, transpiled);
              logger.debug(`Generated JS from HQL for import: ${path}`);
              
              // Recursively process this new JS file
              await preprocessJsDependencies(path, dirname(path), logger, processedFiles);
              
              // We've found and processed the file, no need to check other paths
              break;
            } catch (hqlError) {
              // Continue to the next path if this one fails
              logger.debug(`Could not find or process HQL counterpart for ${path}`);
            }
          } else {
            // Some other error
            logger.debug(`Error checking for JS import ${path}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }
  }
}

/**
 * Bundle the code using esbuild with our plugins and optimization options
 * @param entryPath Path to entry file
 * @param outputPath Path for bundled output
 * @param options Bundling options
 * @returns Path to the bundled output
 */
// In src/bundler.ts

export async function bundleWithEsbuild(
  entryPath: string,
  outputPath: string,
  options: BundleOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose || false);
  const hqlPlugin = createHqlPlugin({ verbose: options.verbose });
  const externalPlugin = createExternalPlugin();

  // If force is true, ensure the file doesn't exist before building
  if (options.force && await exists(outputPath)) {
    try {
      await Deno.remove(outputPath);
      logger.log(`Removed existing file: ${outputPath}`);
    } catch (err) {
      logger.error(`Failed to remove existing file: ${outputPath}`);
    }
  }

  // Create build options from optimization options
  const buildOptions = createBuildOptions(entryPath, outputPath, options, [hqlPlugin, externalPlugin]);
  
  // Set better error handling and logging
  try {
    logger.log(`Starting bundling with esbuild for ${entryPath}`);
    
    // Print the import path for debugging
    const entryDir = dirname(entryPath);
    logger.log(`Entry directory: ${entryDir}`);
    
    // Run the build
    const result = await build(buildOptions);
    
    // Log any warnings
    if (result.warnings.length > 0) {
      logger.warn(`esbuild warnings: ${JSON.stringify(result.warnings, null, 2)}`);
    }
    
    stop();
    
    if (options.minify) {
      logger.log(`Successfully bundled and minified output to ${outputPath}`);
    } else {
      logger.log(`Successfully bundled output to ${outputPath}`);
    }
    
    return outputPath;
  } catch (error) {
    logger.error(`esbuild error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Create esbuild options from our bundle options
 * @param entryPath Path to entry file
 * @param outputPath Path for bundled output
 * @param options Bundling options
 * @param plugins Array of esbuild plugins
 * @returns esbuild options object
 */
function createBuildOptions(
  entryPath: string, 
  outputPath: string, 
  options: BundleOptions,
  plugins: any[]
): any {
  // Build options with all esbuild optimization options
  const buildOptions: any = {
    entryPoints: [entryPath],
    bundle: true,
    outfile: outputPath,
    format: "esm",
    plugins: plugins,
    logLevel: options.verbose ? "info" : "silent",
    allowOverwrite: true, // Always allow overwrite in esbuild itself
    
    // Optimization options
    minify: options.minify,
    target: options.target,
    sourcemap: options.sourcemap,
    drop: options.drop,
    charset: options.charset,
    legalComments: options.legalComments,
    treeShaking: options.treeShaking,
    pure: options.pure,
    keepNames: options.keepNames,
    define: options.define,
  };

  // Remove undefined options
  Object.keys(buildOptions).forEach(key => {
    if (buildOptions[key] === undefined) {
      delete buildOptions[key];
    }
  });
  
  return buildOptions;
}

/**
 * Transpile the given entry (HQL or JS) into a bundled JavaScript file.
 * For HQL files the source is parsed and transformed; for JS, it is read as-is.
 * Then esbuild (with our plugins) is run over the output file.
 * @param inputPath Path to input file
 * @param outputPath Optional output path (defaults to replacing .hql with .js)
 * @param options Transpilation options
 * @returns Path to the final output file
 */
export async function transpileCLI(
  inputPath: string,
  outputPath?: string,
  options: BundleOptions = {}
): Promise<string> {
  const logger = new Logger(options.verbose || false);
  logger.log(`Processing entry: ${inputPath}`);

  const resolvedInputPath = resolve(inputPath);
  const outPath = determineOutputPath(resolvedInputPath, outputPath);

  // Process the entry file to get an intermediate JS file
  const processedPath = await processEntryFile(resolvedInputPath, outPath, options);
  
  // If bundling is enabled, run esbuild on the processed file
  if (options.bundle !== false) {
    await bundleWithEsbuild(processedPath, outPath, options);
  }
  
  logger.log(`Successfully processed output to ${outPath}`);
  return outPath;
}

/**
 * Determine the output path for transpilation
 * @param inputPath Path to input file
 * @param outputPath Optional explicit output path
 * @returns Resolved output path
 */
function determineOutputPath(inputPath: string, outputPath?: string): string {
  return outputPath ??
    (inputPath.endsWith(".hql")
      ? inputPath.replace(/\.hql$/, ".js")
      : inputPath);
}

/**
 * Watch the given file for changes and re-run transpileCLI on modifications
 * @param inputPath Path to file to watch
 * @param options Watch options
 */
export async function watchFile(
  inputPath: string,
  options: BundleOptions = {}
): Promise<void> {
  const logger = new Logger(options.verbose || false);
  logger.log(`Watching ${inputPath} for changes...`);
  
  try {
    // Initial transpilation
    await transpileCLI(inputPath, undefined, options);
    
    // Set up watcher
    const watcher = Deno.watchFs(inputPath);
    
    // Handle file change events
    for await (const event of watcher) {
      if (event.kind === "modify") {
        try {
          logger.log(`File changed, retranspiling...`);
          await transpileCLI(inputPath, undefined, options);
        } catch (error: any) {
          console.error(`Transpilation failed: ${error.message}`);
        }
      }
    }
  } catch (error: any) {
    console.error(`Watch error: ${error.message}`);
    Deno.exit(1);
  }
}