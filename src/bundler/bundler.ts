// src/bundler/bundler.ts
import { join, dirname, basename } from "../platform/platform.ts";

// Simple cache for bundled content
const bundleCache = new Map<string, { content: string, timestamp: number }>();

/**
 * Bundle a JavaScript file into a single self-contained file.
 * This uses Deno's bundler to create a fully self-contained JS file.
 * 
 * @param filePath - Path to the JavaScript file to bundle
 * @param options - Bundling options
 * @returns Promise<string> - The bundled JavaScript content
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
  
  // Create a cache key based on file path, format, and file stats
  let cacheKey: string;
  let useCache = true;
  try {
    const stat = await Deno.stat(filePath);
    const mtime = stat.mtime?.getTime() || 0;
    cacheKey = `${filePath}:${format}:${mtime}`;
    
    // Check cache if available and file hasn't changed
    const cached = bundleCache.get(cacheKey);
    if (cached) {
      if (verbose) console.log(`Using cached bundle for: ${filePath}`);
      
      // If an output path is specified, write the cached content
      if (options.outputPath) {
        await Deno.writeTextFile(options.outputPath, cached.content);
        if (verbose) console.log(`Wrote cached bundle to: ${options.outputPath}`);
      }
      
      return cached.content;
    }
  } catch (error) {
    // If there's an error getting stats, we won't use caching
    useCache = false;
    if (verbose) console.warn(`Cache disabled for bundling - couldn't get file stats: ${error.message}`);
  }
  
  try {
    if (verbose) console.log(`Bundling JavaScript file: ${filePath}`);
    
    // Run Deno bundle command
    const cmd = ["deno", "bundle"];
    
    // Add format option if specified
    if (format === "commonjs") {
      cmd.push("--format", "commonjs");
    }
    
    // Add the input and output paths
    cmd.push(filePath, tempOutputPath);
    
    if (verbose) console.log(`Running command: ${cmd.join(' ')}`);
    
    // Execute the bundle command
    const process = Deno.run({
      cmd,
      stdout: "piped",
      stderr: "piped",
    });
    
    // Wait for the process to complete
    const status = await process.status();
    
    if (!status.success) {
      const errorOutput = new TextDecoder().decode(await process.stderrOutput());
      process.close();
      throw new Error(`Bundling failed: ${errorOutput}`);
    }
    
    process.close();
    
    // Read the bundled output
    const bundled = await Deno.readTextFile(tempOutputPath);
    
    // Cache the result if caching is enabled
    if (useCache && cacheKey) {
      bundleCache.set(cacheKey, { 
        content: bundled, 
        timestamp: Date.now() 
      });
      
      // Limit cache size to prevent memory leaks (keep last 50 entries)
      if (bundleCache.size > 50) {
        const oldestKey = [...bundleCache.entries()]
          .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
        bundleCache.delete(oldestKey);
      }
    }
    
    // Clean up the temporary file if it's not the requested output
    if (!options.outputPath) {
      try {
        await Deno.remove(tempOutputPath);
      } catch (e) {
        // Ignore cleanup errors
        if (verbose) console.warn(`Failed to remove temporary bundle file: ${e.message}`);
      }
    }
    
    if (verbose) console.log(`Successfully bundled: ${filePath}`);
    return bundled;
  } catch (error) {
    // Enhance error reporting
    const errorMessage = error instanceof Error ? 
      error.message : 
      'Unknown error during bundling';
    
    throw new Error(`Bundling error for ${filePath}: ${errorMessage}`);
  }
}