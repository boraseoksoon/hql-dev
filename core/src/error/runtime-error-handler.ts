// core/src/error/runtime-error-handler.ts
// Complete implementation for mapping JS errors back to HQL source

import { SourceLocation, RuntimeError } from './error-types.ts';
import { errorManager } from './error-manager.ts';
import { sourceMapper } from './source-mapper.ts';
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";

/**
 * Wrap JavaScript output with error handling code 
 */
export function generateRuntimeWrapper(jsCode: string, sourceFilePath: string): string {
  // Create the wrapper with proper source location tracking
  return `
// HQL Runtime Error Handler
(function() {
  const HQL_SOURCE_FILE = "${sourceFilePath}";
  
  // Create a mapping function to find original HQL locations
  function __hqlMapErrorLocation(jsFile, jsLine, jsColumn) {
    // The sourceMapper contains our JS → HQL mappings
    // This lookup happens at runtime in the generated code
    const mappings = ${JSON.stringify(Array.from(sourceMapper.getAllMappings()))};
    
    // Find closest mapping
    let bestMatch = null;
    for (const mapping of mappings) {
      if (mapping.generated.file === jsFile && 
          mapping.generated.line <= jsLine && 
          (mapping.generated.line === jsLine && mapping.generated.column <= jsColumn)) {
        if (!bestMatch || 
            mapping.generated.line > bestMatch.generated.line || 
            (mapping.generated.line === bestMatch.generated.line && 
             mapping.generated.column > bestMatch.generated.column)) {
          bestMatch = mapping;
        }
      }
    }
    
    return bestMatch ? bestMatch.original : {
      filePath: HQL_SOURCE_FILE,
      line: 1,
      column: 1
    };
  }
  
  // Error handler function
  function __hqlHandleError(e) {
    if (!(e instanceof Error)) {
      throw e;
    }
    
    try {
      // Parse stack trace to get JS location
      const stack = e.stack || '';
      const stackMatch = stack.match(/at\\s+(?:\\w+\\s+\\()?(.+?):(\\d+):(\\d+)/);
      
      if (stackMatch) {
        const [, jsFile, jsLineStr, jsColStr] = stackMatch;
        const jsLine = parseInt(jsLineStr, 10);
        const jsColumn = parseInt(jsColStr, 10);
        
        // Map to HQL source
        const hqlLocation = __hqlMapErrorLocation(jsFile, jsLine, jsColumn);
        
        // Enhance error with HQL source information
        e.message = \`\${e.name}: \${e.message} in \${hqlLocation.filePath}:\${hqlLocation.line}:\${hqlLocation.column}\`;
        
        // Attach HQL location for debugging
        e.hqlLocation = hqlLocation;
        e.originalStack = stack;
      }
    } catch (mappingError) {
      // If error mapping fails, preserve the original error
      console.warn("Failed to map runtime error to HQL source:", mappingError);
    }
    
    // Rethrow the enhanced error
    throw e;
  }
  
  // Execute code in try/catch block
  try {
    ${jsCode}
  } catch (e) {
    __hqlHandleError(e);
  }
})();
`;
}

/**
 * Process a JavaScript runtime error and map it back to HQL source
 */
export function processRuntimeError(error: Error, jsFilePath: string): RuntimeError {
  // Extract location from stack trace
  const stackLines = error.stack?.split('\n') || [];
  let jsFile = jsFilePath;
  let jsLine = 1;
  let jsColumn = 1;
  
  // Parse the stack trace to find file:line:column information
  for (const line of stackLines) {
    const match = line.match(/at\s+(?:\w+\s+\()?(.+?):(\d+):(\d+)/);
    if (match) {
      jsFile = match[1];
      jsLine = parseInt(match[2], 10);
      jsColumn = parseInt(match[3], 10);
      break;
    }
  }
  
  // Try to map back to HQL
  const hqlLocation = sourceMapper.findOriginalLocation(jsFile, jsLine, jsColumn);
  
  if (hqlLocation) {
    // Create a runtime error with HQL source location
    return errorManager.createRuntimeError(
      error.message,
      hqlLocation,
      undefined,
      error
    );
  }
  
  // If mapping fails, create error with original JS location
  return errorManager.createRuntimeError(
    error.message,
    {
      filePath: jsFile,
      line: jsLine,
      column: jsColumn
    },
    "This error occurred in generated JavaScript code.",
    error
  );
}

/**
 * Install a global error handler for Node.js/Deno
 */
export function installGlobalErrorHandler(): void {
    if (typeof addEventListener === "function") {
        // Synchronous exceptions (throw …)
        addEventListener("error", (ev: ErrorEvent) => {
        const err = ev.error ?? new Error(ev.message);
        const hqlErr = processRuntimeError(err, "unknown");
        console.error(errorManager.formatError(hqlErr));

        // Prevent default so Deno doesn’t print its own trace & exit:
        ev.preventDefault();
        });

        // Unhandled Promise rejections
        addEventListener(
        "unhandledrejection",
        (ev: PromiseRejectionEvent) => {
            const err =
            ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason));
            const hqlErr = processRuntimeError(err, "unknown");
            console.error(errorManager.formatError(hqlErr));

            // Stop the default “terminate on unhandled rejection” behaviour
            ev.preventDefault();
        },
        );
    }
}

/**
 * Check if an error has HQL source information
 */
export function hasHqlSourceInfo(error: any): boolean {
  return error && error.hqlLocation && error.hqlLocation.filePath;
}

/**
 * Extract HQL source information from an error
 */
export function extractHqlSourceInfo(error: any): SourceLocation | undefined {
  if (hasHqlSourceInfo(error)) {
    return error.hqlLocation;
  }
  return undefined;
}