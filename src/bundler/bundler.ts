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
  // Determine the temporary output path:
  // If an explicit outputPath is provided, we will use it later to write the final bundled content.
  // Otherwise, we use `${filePath}.bundle.js` as the temporary file.
  const tempOutputPath = options.outputPath || `${filePath}.bundle.js`;
  const format = options.format || "esm";
  const verbose = options.verbose || false;
  
  if (verbose) {
    console.log(`\n[Bundler] Starting bundling process for: ${filePath}`);
    console.log(`[Bundler] Temporary output path set to: ${tempOutputPath}`);
    console.log(`[Bundler] Module format: ${format}`);
  }
  
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
      if (verbose) console.log(`[Bundler] Using cached bundle for: ${filePath}`);
      
      // If an output path is specified, write the cached content
      if (options.outputPath) {
        await Deno.writeTextFile(options.outputPath, cached.content);
        if (verbose) console.log(`[Bundler] Wrote cached bundle to: ${options.outputPath}`);
      }
      
      return cached.content;
    }
  } catch (error) {
    useCache = false;
    if (verbose) console.warn(`[Bundler] Cache disabled - couldn't get file stats: ${error.message}`);
  }
  
  try {
    // Build the Deno bundle command
    const cmd = ["deno", "bundle"];
    if (format === "commonjs") {
      cmd.push("--format", "commonjs");
    }
    cmd.push(filePath, tempOutputPath);
    
    if (verbose) {
      console.log(`[Bundler] Running command: ${cmd.join(' ')}`);
    }
    
    // Execute the bundle command
    const process = Deno.run({
      cmd,
      stdout: "piped",
      stderr: "piped",
    });
    
    // Wait for the process to complete
    const status = await process.status();
    
    // Capture stdout and stderr output for debugging
    const stdout = new TextDecoder().decode(await process.output());
    const stderr = new TextDecoder().decode(await process.stderrOutput());
    
    if (verbose) {
      console.log(`[Bundler] Command stdout: ${stdout}`);
      console.log(`[Bundler] Command stderr: ${stderr}`);
    }
    
    if (!status.success) {
      process.close();
      throw new Error(`Bundling failed: ${stderr}`);
    }
    
    process.close();
    
    if (verbose) {
      console.log(`[Bundler] Bundling command completed successfully. Reading output from: ${tempOutputPath}`);
    }
    
    // Read the bundled output
    const bundled = await Deno.readTextFile(tempOutputPath);
    if (verbose) {
      console.log(`[Bundler] Bundled content length: ${bundled.length} characters`);
    }
    
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
    
    // Clean up the temporary file if no explicit output path was provided.
    if (!options.outputPath) {
      try {
        await Deno.remove(tempOutputPath);
        if (verbose) {
          console.log(`[Bundler] Temporary file ${tempOutputPath} removed.`);
        }
      } catch (e) {
        if (verbose) console.warn(`[Bundler] Failed to remove temporary file: ${e.message}`);
      }
    } else {
      if (verbose) {
        console.log(`[Bundler] Final bundled output will be available at: ${options.outputPath}`);
      }
    }
    
    if (verbose) {
      console.log(`[Bundler] Successfully bundled: ${filePath}\n`);
    }
    
    return bundled;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during bundling';
    throw new Error(`[Bundler] Bundling error for ${filePath}: ${errorMessage}`);
  }
}
