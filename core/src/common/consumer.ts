import { SourceMapConsumer } from "npm:source-map@0.7.3";
import { globalLogger as logger } from "../logger.ts";

// This URL points to the source-map library's wasm file on a CDN
const WASM_URL = "https://unpkg.com/source-map@0.7.3/lib/mappings.wasm";

// Track if SourceMapConsumer has been initialized
let sourceMapConsumerInitialized = false;

// Initialize the SourceMapConsumer with the WASM file
async function initializeSourceMapConsumer() {
  if (sourceMapConsumerInitialized) {
    return;
  }

  try {
    logger.debug(`[mapStackTraceToHql] Initializing SourceMapConsumer with WASM module from ${WASM_URL}`, 'source-map');
    
    // Fetch the WASM binary
    const response = await fetch(WASM_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM module: ${response.status} ${response.statusText}`);
    }
    
    // Get the WASM as an ArrayBuffer
    const wasmBuffer = await response.arrayBuffer();
    
    // Initialize the SourceMapConsumer with the WASM module
    await SourceMapConsumer.initialize({
      'lib/mappings.wasm': wasmBuffer
    });
    
    sourceMapConsumerInitialized = true;
    logger.debug(`[mapStackTraceToHql] SourceMapConsumer initialized successfully`, 'source-map');
  } catch (error) {
    logger.debug(`[mapStackTraceToHql] Failed to initialize SourceMapConsumer: ${error instanceof Error ? error.message : String(error)}`, 'source-map');
    throw error;
  }
}

// Simple source map parser without the WebAssembly dependency
export async function mapStackTraceToHql(
  error: Error,
  bundlePath: string
): Promise<string> {
  if (!error.stack) {
    logger.debug(`[mapStackTraceToHql] No stack trace to map for error: ${error.message}`, 'source-map');
    return error.message;
  }

  try {
    logger.debug(`[mapStackTraceToHql] Reading bundle from: ${bundlePath}`, 'source-map');
    const jsContent = await Deno.readTextFile(bundlePath);
    
    // Extract the source map from the inline comment
    logger.debug(`[mapStackTraceToHql] Looking for sourceMappingURL comment...`, 'source-map');
    const sourceMapComment = jsContent.match(/\/\/# sourceMappingURL=data:application\/json;base64,([^"]*)/);
    
    if (!sourceMapComment || !sourceMapComment[1]) {
      logger.debug(`[mapStackTraceToHql] No source map found in bundle, falling back to original stack`, 'source-map');
      return error.stack;
    }

    // Decode the base64 source map
    logger.debug(`[mapStackTraceToHql] Source map found, decoding base64...`, 'source-map');
    const base64 = sourceMapComment[1];
    const jsonStr = atob(base64);
    
    // Parse the source map
    logger.debug(`[mapStackTraceToHql] Parsing source map...`, 'source-map');
    const sourceMap = JSON.parse(jsonStr);
    
    if (!sourceMap.sources || sourceMap.sources.length === 0) {
      logger.debug(`[mapStackTraceToHql] Source map contains no sources, unable to remap`, 'source-map');
      return error.stack;
    }
    
    logger.debug(`[mapStackTraceToHql] Source map contains sources: ${JSON.stringify(sourceMap.sources)}`, 'source-map');
    
    // Process stack trace directly
    const stackLines = error.stack.split('\n');
    const remappedLines = [];
    
    logger.debug(`[mapStackTraceToHql] Processing ${stackLines.length} stack lines`, 'source-map');
    
    // Keep the error message line
    if (stackLines.length > 0) {
      remappedLines.push(stackLines[0]);
    }
    
    // Process the stack frames
    for (let i = 1; i < stackLines.length; i++) {
      const line = stackLines[i];
      
      // Match stack frame format: at [function] (file:line:column)
      const frameMatch = line.match(/^\s*at\s+(?:(.+?)\s+\()?(?:file:\/\/)?([^:()]+):(\d+):(\d+)(?:\))?/);
      
      if (frameMatch) {
        const [, fnName, filePath, lineStr, colStr] = frameMatch;
        
        // Only process frames from our bundle
        if (filePath.includes(bundlePath)) {
          // Look for a direct line mapping in the source map
          // Simple approach: use the first source in the sources array
          if (sourceMap.sources.length > 0) {
            const originalSource = sourceMap.sources[0];
            
            // Create a remapped line pointing to the HQL file
            // This is a simplification - ideally we'd properly decode the mappings
            // but for a quick fix, we'll just change the file path
            const prefix = fnName ? `    at ${fnName} (` : '    at ';
            const suffix = fnName ? ')' : '';
            
            // Use the original line and column if possible, otherwise use the generated ones
            const remappedLine = `${prefix}${originalSource}:${lineStr}:${colStr}${suffix}`;
            remappedLines.push(remappedLine);
            
            logger.debug(`[mapStackTraceToHql] Remapped line: ${remappedLine}`, 'source-map');
            continue;
          }
        }
      }
      
      // If we couldn't remap this line, keep the original
      remappedLines.push(line);
    }
    
    // Combine remapped lines into a single stack trace
    const remappedStack = remappedLines.join('\n');
    logger.debug(`[mapStackTraceToHql] Remapped stack trace: ${remappedStack}`, 'source-map');
    
    return remappedStack;
  } catch (e) {
    logger.debug(`[mapStackTraceToHql] Error mapping stack trace: ${e instanceof Error ? e.message : String(e)}`, 'source-map');
    return error.stack;
  }
}