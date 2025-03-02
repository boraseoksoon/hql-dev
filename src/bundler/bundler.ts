// src/bundler/bundler.ts - Improved bundler module with better error handling
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
  
  if (verbose) {
    console.log(`\n🔄 Bundling JavaScript file: "${filePath}"`);
    console.log(`  → Format: ${format}`);
    console.log(`  → Output: "${tempOutputPath}"`);
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
      if (verbose) console.log(`  → Using cached bundle (${cached.content.length} bytes)`);
      
      // If an output path is specified, write the cached content
      if (options.outputPath) {
        await Deno.writeTextFile(options.outputPath, cached.content);
        if (verbose) console.log(`  → Wrote cached bundle to: "${options.outputPath}"`);
      }
      
      return cached.content;
    }
  } catch (error) {
    useCache = false;
    if (verbose) console.warn(`⚠️ Cache disabled - couldn't get file stats: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  try {
    // Build the Deno bundle command
    const cmd = ["deno", "bundle"];
    if (format === "commonjs") {
      cmd.push("--format", "commonjs");
    }
    cmd.push(filePath, tempOutputPath);
    
    if (verbose) {
      console.log(`  → Running: ${cmd.join(' ')}`);
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
    
    if (verbose && stdout.trim()) {
      console.log(`  → Command output: ${stdout.trim()}`);
    }
    
    if (!status.success) {
      process.close();
      console.error(`\n❌ Bundling failed: ${stderr}`);
      throw new Error(`Bundling failed with exit code ${status.code}: ${stderr}`);
    }
    
    process.close();
    
    if (verbose) {
      console.log(`  → Bundle command completed successfully`);
    }
    
    // Read the bundled output
    const bundled = await Deno.readTextFile(tempOutputPath);
    if (verbose) {
      console.log(`  → Bundled content size: ${bundled.length} bytes`);
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
        if (verbose) console.log(`  → Removed oldest cache entry to manage size`);
      }
    }
    
    // Clean up the temporary file if no explicit output path was provided.
    if (!options.outputPath) {
      try {
        await Deno.remove(tempOutputPath);
        if (verbose) {
          console.log(`  → Cleaned up temporary file: "${tempOutputPath}"`);
        }
      } catch (e) {
        if (verbose) console.warn(`  ⚠️ Failed to remove temporary file: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    
    console.log(`\n✅ Successfully bundled: "${filePath}"`);
    return bundled;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during bundling';
    throw new Error(`Bundling error for "${filePath}": ${errorMessage}`);
  }
}