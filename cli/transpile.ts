// cli/transpile.ts - Generates a single fully bundled self-contained JS output,
// with relative imports rebased when the output file is in a different directory.

import { dirname, resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { parse } from "../src/transpiler/parser.ts";
import { transformAST, transpile } from "../src/transpiler/transformer.ts";
import { readTextFile, writeTextFile, mkdir } from "../src/platform/platform.ts";
import { build, stop } from "https://deno.land/x/esbuild@v0.17.19/mod.js";

// A simple logger controlled by the HQL_DEBUG env variable.
function log(message: string) {
  if (Deno.env.get("HQL_DEBUG") === "1") {
    console.log(message);
  }
}

/**
 * Rebase relative import specifiers in the code.
 * If the output file is in a different directory from the input,
 * relative imports must be replaced with absolute paths based on the original input file's directory.
 */
function rebaseImports(code: string, originalDir: string): string {
  return code.replace(
    /(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g,
    (_, prefix, relPath, suffix) => {
      // Compute the absolute path using the original input file's directory.
      const absPath = resolve(originalDir, relPath);
      return `${prefix}${absPath}${suffix}`;
    }
  );
}

/**
 * Transpile an HQL file into a fully bundled, self-contained JavaScript file.
 * Bundling is forced so that all dependencies (including HQL imports) are inlined.
 *
 * @param inputPath Path to the entry HQL file.
 * @param outputPath Optional output file path; if not provided, it replaces .hql with .js in the input file’s directory.
 * @param options Optional flags, e.g. verbose.
 */
export async function transpileCLI(
  inputPath: string,
  outputPath?: string,
  options: { verbose?: boolean } = {}
): Promise<string> {
  try {
    log(`Transpiling ${inputPath}...`);

    // Resolve the input file path.
    const resolvedInputPath = resolve(inputPath);
    log(`Resolved input path: ${resolvedInputPath}`);

    // Determine the output file path. Default: same directory with .hql replaced by .js.
    const outPath = outputPath ?? resolvedInputPath.replace(/\.hql$/, '.js');
    log(`Output path: ${outPath}`);

    // Read and parse the source HQL file.
    const userSource = await Deno.readTextFile(resolvedInputPath);
    const ast = parse(userSource);

    // Transform the AST with bundling enabled so that all HQL imports are inlined.
    const originalDir = dirname(resolvedInputPath);
    const transformed = await transformAST(ast, originalDir, {
      bundle: true,
      verbose: options.verbose,
    });

    // If the output file is not in the same directory as the input,
    // rebase relative import paths in the transformed code.
    const outputDir = dirname(outPath);
    const rebasedCode =
      outputDir !== originalDir ? rebaseImports(transformed, originalDir) : transformed;

    // Write the intermediate (transformed) JS output.
    await writeOutput(rebasedCode, outPath);
    log(`Successfully transpiled ${inputPath} -> ${outPath}`);

    // Define a custom plugin to handle HQL imports.
    const hqlPlugin = {
      name: "hql-plugin",
      setup(build) {
        // For any import ending with .hql, resolve it to an absolute path and assign a custom namespace.
        build.onResolve({ filter: /\.hql$/ }, (args) => {
          // Since we've rebased our imports, args.path should now be absolute.
          return { path: args.path, namespace: "hql" };
        });
        // Load the HQL file: transpile it on the fly and supply valid JS code.
        build.onLoad({ filter: /.*/, namespace: "hql" }, async (args) => {
          const source = await Deno.readTextFile(args.path);
          const transpiledHql = await transpile(source, args.path, {
            bundle: true,
            verbose: options.verbose,
          });
          return { contents: transpiledHql, loader: "js" };
        });
      },
    };

    // Plugin to mark npm: imports as external.
    const externalNpmPlugin = {
      name: "external-npm",
      setup(build) {
        build.onResolve({ filter: /^npm:/ }, (args) => {
          return { path: args.path, external: true };
        });
      },
    };

    // Run esbuild to bundle the entry (intermediate) file.
    await build({
      entryPoints: [outPath],
      bundle: true,
      outfile: outPath,
      format: "esm",
      plugins: [hqlPlugin, externalNpmPlugin],
      logLevel: options.verbose ? "info" : "silent",
      allowOverwrite: true,
    });
    stop();
    log(`Successfully bundled output to ${outPath}`);
    return outPath;
  } catch (error: any) {
    console.error(`Transpilation failed: ${error.message}`);
    throw error;
  }
}

/**
 * Write code to a given output file.
 */
async function writeOutput(code: string, outputPath: string): Promise<void> {
  try {
    const outputDir = dirname(outputPath);
    try {
      await mkdir(outputDir, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }
    await writeTextFile(outputPath, code);
    log(`Output written to: ${outputPath}`);
  } catch (error: any) {
    throw new Error(`Failed to write output: ${error.message}`);
  }
}

/**
 * Watch the input file for changes and re-transpile on modifications.
 */
async function watchFile(
  inputPath: string,
  options: { verbose?: boolean } = {}
): Promise<void> {
  log(`Watching ${inputPath} for changes...`);
  try {
    await transpileCLI(inputPath, undefined, options);
    const watcher = Deno.watchFs(inputPath);
    for await (const event of watcher) {
      if (event.kind === "modify") {
        try {
          log(`File changed, retranspiling...`);
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

// -------------------------
// CLI Entry Point
// -------------------------
if (import.meta.main) {
  const args = Deno.args;
  if (args.length < 1 || args.includes("--help")) {
    console.error(
      "Usage: deno run -A cli/transpile.ts <input.hql> [output.js] [--run] [--watch] [--verbose]"
    );
    Deno.exit(1);
  }

  const inputPath = args[0];
  let outputPath: string | undefined = undefined;
  let watch = false;
  let verbose = false;
  let runAfter = false;

  // Process positional argument for output file if provided.
  if (args.length > 1 && !args[1].startsWith("--")) {
    outputPath = args[1];
  }
  // Process flags.
  for (const arg of args) {
    if (arg === "--watch") watch = true;
    if (arg === "--verbose") verbose = true;
    if (arg === "--run") runAfter = true;
  }
  if (verbose) {
    Deno.env.set("HQL_DEBUG", "1");
    console.log("Verbose logging enabled");
  }

  if (watch) {
    watchFile(inputPath, { verbose }).catch(() => Deno.exit(1));
  } else {
    transpileCLI(inputPath, outputPath, { verbose })
      .then(async (bundledPath) => {
        if (runAfter) {
          console.log(`Running bundled output: ${bundledPath}`);
          await import("file://" + resolve(bundledPath));
        }
      })
      .catch(() => Deno.exit(1));
  }
}
