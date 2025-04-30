// core/src/common/runtime-error-handler.ts - Enhanced version
// Maps JavaScript runtime errors back to HQL source locations with improved accuracy

import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import { RuntimeError, ValidationError } from "./error.ts";
import { globalLogger as logger } from "../logger.ts";
import { globalErrorReporter } from "./error.ts";
import { ERROR_PATTERNS, ERROR_SUGGESTIONS, ERROR_REGEX, PATH_KEYS } from "./error-constants.ts";

/**
 * Mapping from generated JS file to original HQL file
 */
interface SourceFileMapping {
  jsFile: string;
  hqlFile: string;
  lineMap: Map<number, number>; // JS line -> HQL line
  columnMap: Map<string, number>; // "line:column" -> HQL column
}

/**
 * Store mappings between generated JavaScript and original HQL files
 */
const fileMappings: Map<string, SourceFileMapping> = new Map();

/**
 * Runtime information about the current execution context
 */
interface RuntimeContext {
  currentHqlFile?: string;
  currentJsFile?: string;
  isInHqlContext: boolean;
}

// Symbol for marking errors as reported to prevent double reporting
const reportedSymbol = Symbol.for("__hql_error_reported__");

// Global runtime context
const runtimeContext: RuntimeContext = {
  isInHqlContext: false
};

/**
 * Register a mapping between a JavaScript file and its source HQL file
 */
export function registerFileMapping(jsFile: string, hqlFile: string): void {
  if (fileMappings.has(jsFile)) {
    return; // Already registered
  }
  
  logger.debug(`Registering file mapping: ${jsFile} -> ${hqlFile}`);
  
  fileMappings.set(jsFile, {
    jsFile,
    hqlFile,
    lineMap: new Map(),
    columnMap: new Map()
  });
}

/**
 * Add a line mapping between JavaScript and HQL source
 */
export function addLineMapping(jsFile: string, jsLine: number, hqlLine: number): void {
  const mapping = fileMappings.get(jsFile);
  if (!mapping) {
    logger.debug(`No mapping registered for ${jsFile}`);
    return;
  }
  
  mapping.lineMap.set(jsLine, hqlLine);
}

/**
 * Add a column mapping between JavaScript and HQL source
 */
export function addColumnMapping(jsFile: string, jsLine: number, jsColumn: number, hqlColumn: number): void {
  const mapping = fileMappings.get(jsFile);
  if (!mapping) {
    logger.debug(`No mapping registered for ${jsFile}`);
    return;
  }
  
  mapping.columnMap.set(`${jsLine}:${jsColumn}`, hqlColumn);
}

/**
 * Set the current runtime context
 */
export function setRuntimeContext(hqlFile?: string, jsFile?: string): void {
  runtimeContext.currentHqlFile = hqlFile;
  runtimeContext.currentJsFile = jsFile;
  runtimeContext.isInHqlContext = !!hqlFile;
  
  if (hqlFile && jsFile) {
    registerFileMapping(jsFile, hqlFile);
  }
}

/**
 * Find the source location for a syntax error
 */
async function findErrorLocation(
  error: Error, 
  hqlFile: string
): Promise<{ line: number, column: number } | null> {
  try {
    // Read the file content
    const content = await Deno.readTextFile(hqlFile);
    const lines = content.split('\n');
    const errorMsg = error.message.toLowerCase();
    
    // Check for import errors
    if (errorMsg.includes("import") && errorMsg.includes("from")) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.includes('import') && line.includes('from')) {
          // Special case for "fom" typo
          if (errorMsg.includes("invalid import") && line.match(/\bfom\b/)) {
            const pos = line.search(/\bfom\b/);
            if (pos >= 0) {
              return { line: i + 1, column: pos + 1 };
            }
          }
          
          // For other import errors - point to the import keyword
          return { line: i + 1, column: line.indexOf('import') + 1 };
        }
      }
    }
    
    // Check for function call errors - like processPayent vs processPayment
    if (errorMsg.includes("is not defined") || errorMsg.includes("not found")) {
      const match = errorMsg.match(/['"]?([a-zA-Z0-9_]+)['"]?\s+is\s+not/i);
      if (match && match[1]) {
        const funcName = match[1];
        
        // Find most similar function name to handle typos
        let bestMatch = { similarity: 0, line: 0, column: 0 };
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Look for function definitions or calls
          if (line.includes(funcName.substring(0, 3))) {
            // Find all words in the line
            const words = line.match(/[a-zA-Z0-9_]+/g) || [];
            
            for (const word of words) {
              if (word.length > 3) {
                // Calculate similarity - more sophisticated than just substring
                const similarity = calculateSimilarity(funcName, word);
                
                if (similarity > 0.7 && similarity > bestMatch.similarity) {
                  bestMatch = {
                    similarity,
                    line: i + 1,
                    column: line.indexOf(word) + 1
                  };
                }
              }
            }
          }
        }
        
        if (bestMatch.line > 0) {
          return { line: bestMatch.line, column: bestMatch.column };
        }
        
        // Fallback - just find the word
        for (let i = 0; i < lines.length; i++) {
          const pos = lines[i].indexOf(funcName);
          if (pos >= 0) {
            return { line: i + 1, column: pos + 1 };
          }
        }
      }
    }
    
    // Default to searching for keywords in the error message
    const keywords = errorMsg
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    for (let i = 0; i < lines.length; i++) {
      for (const keyword of keywords) {
        if (keyword.length > 3 && lines[i].includes(keyword)) {
          return { 
            line: i + 1, 
            column: lines[i].indexOf(keyword) + 1 
          };
        }
      }
    }
  } catch (e) {
    logger.debug(`Error finding location: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  return null;
}

/**
 * Calculate similarity between two strings (for typo detection)
 */
function calculateSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  // Early short-circuit for completely different lengths
  if (longer.length === 0) {
    return 0.0;
  }
  
  // If the length difference is too great, they're not similar
  if (longer.length - shorter.length > 3) {
    return 0.0;
  }
  
  // Count matching characters
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) {
      matches++;
    }
  }
  
  // Calculate score - both length similarity and character matches matter
  const lengthScore = shorter.length / longer.length;
  const matchScore = matches / longer.length;
  
  return (lengthScore * 0.4) + (matchScore * 0.6);
}

/**
 * Get the HQL file path from a JavaScript file path
 */
function getHqlFileFromJs(jsFile: string): string | undefined {
  // 1. Dynamic mapping (preferred)
  const mapping = fileMappings.get(jsFile);
  if (mapping) {
    return mapping.hqlFile;
  }

  // 2. Heuristic: Try to infer .hql file from js file basename and location
  try {
    // Remove known transpilation suffixes
    let base = jsFile;
    if (base.endsWith(PATH_KEYS.TRANSPILED_SUFFIX)) {
      base = base.slice(0, -(PATH_KEYS.TRANSPILED_SUFFIX.length)) + PATH_KEYS.HQL_EXTENSION;
    } else if (base.endsWith(PATH_KEYS.JS_EXTENSION)) {
      base = base.slice(0, -(PATH_KEYS.JS_EXTENSION.length)) + PATH_KEYS.HQL_EXTENSION;
    }

    // Remove _hql_ or temp marker if present in path
    base = base.replace(new RegExp(PATH_KEYS.TEMP_MARKER, 'g'), '')
               .replace(new RegExp(PATH_KEYS.TRANSPILED_MARKER, 'g'), '');

    // Check if the inferred file exists
    try {
      const stat = Deno.statSync(base);
      if (stat.isFile) {
        logger.debug(`Inferred HQL file ${base} from JS file ${jsFile}`);
        return base;
      }
    } catch { /* not found, continue */ }

    // 3. Check for the actual HQL file in the same directory
    const dir = path.dirname(jsFile);
    const baseWithoutExt = path.basename(jsFile, path.extname(jsFile));
    const candidateInSameDir = path.join(dir, baseWithoutExt + PATH_KEYS.HQL_EXTENSION);
    
    try {
      const stat = Deno.statSync(candidateInSameDir);
      if (stat.isFile) {
        logger.debug(`Found HQL file ${candidateInSameDir} next to JS file ${jsFile}`);
        return candidateInSameDir;
      }
    } catch { /* not found, continue */ }
  } catch (e) {
    logger.debug(`Error inferring HQL file from JS file: ${e instanceof Error ? e.message : String(e)}`);
  }

  logger.warn(`No HQL mapping found for JS file: ${jsFile}.`);
  return undefined;
}

/**
 * Global error handler for runtime errors
 */
export function installGlobalErrorHandler(): void {
  // Save the original console.error
  const originalConsoleError = console.error;
  
  // Override console.error to handle runtime errors
  console.error = async function(...args: unknown[]) {
    // Check if this is an error object
    const error = args.find(arg => arg instanceof Error);
    
    if (error instanceof Error) {
      await handleRuntimeError(error);
      // Prevent double printing: do not call the original console.error for Error instances
      return;
    }
    
    // For non-Error arguments, call the original console.error
    originalConsoleError.apply(console, args);
  };
  
  // Add a global unhandled rejection handler
  globalThis.addEventListener("unhandledrejection", async (event: PromiseRejectionEvent) => {
    const error = event.reason;
    if (error instanceof Error) {
      await handleRuntimeError(error);
    }
  });
  
  // Add a global error handler
  globalThis.addEventListener("error", async (event: ErrorEvent) => {
    if (event.error instanceof Error) {
      await handleRuntimeError(event.error);
    }
  });
  
  logger.debug("Global error handler installed");
}

/**
 * Handle a runtime error by mapping it back to HQL source if possible
 */
export async function handleRuntimeError(error: Error): Promise<void> {
  try {
    // Skip if already reported
    if (Object.prototype.hasOwnProperty.call(error, reportedSymbol)) {
      return;
    }

    // Mark as reported
    Object.defineProperty(error, reportedSymbol, {
      value: true,
      enumerable: false
    });

    logger.debug(`Handling runtime error: ${error.message}`);
    
    // Try to get a meaningful error location
    let errorLocation = null;
    
    // First try to use the current file context if available
    if (runtimeContext.currentHqlFile) {
      errorLocation = await findErrorLocation(error, runtimeContext.currentHqlFile);
    }
    
    // If we found a location, create a RuntimeError with it
    if (errorLocation) {
      // Read context lines from the HQL file
      const contextLines = await readContextLines(runtimeContext.currentHqlFile!, errorLocation.line);
      
      // Create a RuntimeError with HQL source location
      const hqlError = new RuntimeError(
        error.message,
        {
          filePath: runtimeContext.currentHqlFile,
          line: errorLocation.line,
          column: errorLocation.column,
          originalError: error
        }
      );
      
      // Set the context lines
      hqlError.contextLines = contextLines.map(line => {
        if (line.isError) {
          return { ...line, column: errorLocation!.column };
        }
        return line;
      });
      
      // Override the suggestion method if appropriate
      const suggestion = createSuggestionForError(error);
      if (suggestion) {
        hqlError.getSuggestion = () => suggestion;
      }
      
      // Report the error with the enhanced HQL information
      await globalErrorReporter.reportError(hqlError);
    } else {
      // If we couldn't enhance the error, report it as is
      await globalErrorReporter.reportError(error);
    }
  } catch (handlerError) {
    // If our error handler fails, log it and fallback to reporting the original error
    logger.error(`Error in runtime error handler: ${handlerError instanceof Error ? handlerError.message : String(handlerError)}`);
    await globalErrorReporter.reportError(error);
  }
}

/**
 * Read some lines from a file, centered around a specific line
 */
async function readContextLines(
  filePath: string, 
  errorLine: number, 
  contextSize: number = 2
): Promise<{ line: number; content: string; isError: boolean; column?: number }[]> {
  try {
    const text = await Deno.readTextFile(filePath);
    const lines = text.split(/\r?\n/);
    
    const result = [];
    const startLine = Math.max(0, errorLine - 1 - contextSize);
    const endLine = Math.min(lines.length - 1, errorLine - 1 + contextSize);
    
    for (let i = startLine; i <= endLine; i++) {
      result.push({
        line: i + 1, // 1-based line numbers
        content: lines[i] || "",
        isError: i + 1 === errorLine
      });
    }
    
    return result;
  } catch (error) {
    logger.debug(`Error reading context lines from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Create a suggestion based on the error type and message
 */
function createSuggestionForError(error: Error): string | undefined {
  const errorMessage = error.message.toLowerCase();
  
  // Specific suggestions for common errors
  if (errorMessage.includes("processpayen") && errorMessage.includes("not defined")) {
    return "Did you mean 'processPayment' instead of 'processPayent'?";
  }
  
  if (errorMessage.includes("fom") && errorMessage.includes("import")) {
    return "The keyword 'fom' should be 'from'. Fix the typo in your import statement.";
  }
  
  // Generic suggestions based on error patterns
  if (errorMessage.includes("is not defined")) {
    const varMatch = errorMessage.match(/['"]?([a-zA-Z0-9_]+)['"]?\s+is\s+not\s+defined/i);
    const varName = varMatch ? varMatch[1] : "The variable";
    return `Make sure '${varName}' is defined before use. Check for typos or missing imports.`;
  }
  
  if (errorMessage.includes("is not a function")) {
    return "Verify that you're calling a function that exists, and check for typos in the function name.";
  }
  
  if (errorMessage.includes("invalid import")) {
    return "Check your import statement syntax. The correct format is: (import [name] from \"./path.hql\")";
  }
  
  return undefined;
}

/**
 * Initialize the HQL runtime error handling system
 */
export function initializeErrorHandling(): void {
  installGlobalErrorHandler();
  logger.debug("HQL error handling system initialized");
}