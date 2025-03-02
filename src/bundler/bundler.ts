// src/bundler/bundler.ts

import { join, dirname, basename } from "../platform/platform.ts";

// Simple cache for bundled content
const bundleCache = new Map<string, { content: string; timestamp: number }>();

/**
 * Bundle a JavaScript file into a single self-contained file.
 */
export async function bundleJavaScript(
  filePath: string,
  options: {
    outputPath?: string;
    format?: "esm" | "commonjs";
    verbose?: boolean;
  } = {}
): Promise<string> {
  const tempOutputPath = options.outputPath || `${filePath}.bundle.js`;
  const format = options.format || "esm";
  const verbose = options.verbose || false;

  // We must declare and assign cacheKey first:
  let cacheKey = "";
  let useCache = true;

  // Attempt to generate a cacheKey (and possibly assign it):
  try {
    const stat = await Deno.stat(filePath);
    const mtime = stat.mtime?.getTime() || 0;
    cacheKey = `${filePath}:${format}:${mtime}`;
  } catch (error) {
    useCache = false;
    if (verbose) {
      console.warn(`Can't use cache; stat error: ${error.message}`);
    }
  }

  // If we have a valid cacheKey and useCache
  if (useCache && cacheKey) {
    const cached = bundleCache.get(cacheKey);
    if (cached) {
      if (verbose) console.log(`Using cached bundle for: ${filePath}`);
      if (options.outputPath) {
        await Deno.writeTextFile(options.outputPath, cached.content);
        if (verbose) console.log(`Wrote cached bundle to: ${options.outputPath}`);
      }
      return cached.content;
    }
  }

  try {
    if (verbose) console.log(`Bundling JavaScript file: ${filePath}`);
    const cmd = ["deno", "bundle"];
    if (format === "commonjs") {
      cmd.push("--format", "commonjs");
    }
    cmd.push(filePath, tempOutputPath);

    if (verbose) console.log(`Running command: ${cmd.join(" ")}`);

    const process = Deno.run({
      cmd,
      stdout: "piped",
      stderr: "piped",
    });
    const status = await process.status();
    if (!status.success) {
      const errorOutput = new TextDecoder().decode(await process.stderrOutput());
      process.close();
      throw new Error(`Bundling failed: ${errorOutput}`);
    }
    process.close();

    // Read the bundled output
    const bundled = await Deno.readTextFile(tempOutputPath);

    // Cache the result
    if (useCache && cacheKey) {
      bundleCache.set(cacheKey, { content: bundled, timestamp: Date.now() });
      // Limit cache size to 50
      if (bundleCache.size > 50) {
        const oldestKey = [...bundleCache.entries()]
          .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
        bundleCache.delete(oldestKey);
      }
    }

    // If no outputPath given, remove the temp file
    if (!options.outputPath) {
      try {
        await Deno.remove(tempOutputPath);
      } catch (e) {
        if (verbose) console.warn(`Failed removing temp bundle file: ${e.message}`);
      }
    }

    if (verbose) console.log(`Successfully bundled: ${filePath}`);
    return bundled;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown bundling error";
    throw new Error(`Bundling error for ${filePath}: ${msg}`);
  }
}
