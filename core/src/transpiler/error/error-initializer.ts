// src/error-initializer.ts
// Central module for initializing and setting up error handling throughout the system

import { registerSourceFile, formatError, getSuggestion } from "./index.ts";
import { report } from "./errors.ts";
import { Logger } from "../../logger.ts";


// Initialize logger
const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");

/**
 * Initialize error handling throughout the system
 * This should be called once at application startup
 */
export async function initializeErrorHandling(options: {
  enableGlobalHandlers?: boolean; 
  enableReplEnhancement?: boolean;
  repl?: any;
} = {}): Promise<void> {
  // Set up global error handling if requested
  if (options.enableGlobalHandlers !== false) {
    // Use the correct global error setup, assuming initializeErrorHandling is available from CommonError or index
    // If not, this line should be removed or replaced with the correct global error setup
    // (If this is dead code, remove the block entirely)
    // initializeErrorHandling(); // Uncomment if such a function exists
    // Otherwise, remove this block if not needed
    // (For now, do nothing here as withErrorHandling is not a global setup function)

  }

  // Enhance REPL error reporting if requested and REPL is provided
  if (options.enableReplEnhancement !== false && options.repl) {
    enhanceReplErrorReporting(options.repl);
  }
  
  logger.info("Error handling system has been initialized");
}

/**
 * Integrate error handling into the REPL
 */
export function enhanceReplErrorReporting(repl: any): void {
  // Save the original eval function
  const originalEval = repl.eval;
  
  // Replace with enhanced version
  repl.eval = (cmd: string, context: any, filename: string, callback: Function) => {
    // Register the REPL command as a source
    registerSourceFile("REPL", cmd);
    
    // Call the original with a wrapped callback
    originalEval(cmd, context, filename, (err: Error | null, result: any) => {
      if (err) {
        const enhancedErr = report(err, { 
          source: cmd,
          filePath: "REPL"
        });
        
        // Format the error for display
        const formattedError = formatError(enhancedErr, { useColors: true });
        
        // Add suggestion
        const suggestion = getSuggestion(err);
        
        // Pass both to the callback
        callback(new Error(formattedError + "\n\nSuggestion: " + suggestion), null);
      } else {
        callback(null, result);
      }
    });
  };
  
  logger.debug("REPL error reporting has been enhanced");
}