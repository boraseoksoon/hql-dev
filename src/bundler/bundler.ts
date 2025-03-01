// src/bundler/bundler.ts
import { join, dirname, basename, runCmd } from "../platform/platform.ts";

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
    const process = runCmd({
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
    throw new Error(`Bundling error: ${error.message}`);
  }
}