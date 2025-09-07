// core/src/common/runtime-error-handler.ts - Enhanced version
// Maps JavaScript runtime errors back to HQL source locations with improved accuracy

import * as path from "jsr:@std/path@1";
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
 * Initialize the HQL runtime error handling system
 */
export function initializeErrorHandling(): void {
  installGlobalErrorHandler();
  logger.debug("HQL error handling system initialized");
}

// Enhancements to core/src/common/runtime-error-handler.ts
// Adding specific handling for function argument errors

/**
 * Enhanced error handling for runtime errors
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
      
      // Override the suggestion method based on the error type
      const suggestion = getErrorSuggestion(error);
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
 * Get a suggestion based on the type of error
 */
function getErrorSuggestion(error: Error): string | undefined {
  const errorMessage = error.message.toLowerCase();
  
  // Handle function call errors with too many arguments
  if (errorMessage.includes("too many") && errorMessage.includes("arguments")) {
    const funcNameMatch = error.message.match(/function ['"]?([^'"]+?)['"]?[.:\s]/);
    const funcName = funcNameMatch ? funcNameMatch[1] : "";
    
    return `Check the number of arguments being passed to ${funcName ? `'${funcName}'` : "the function"}. You might be passing more arguments than the function accepts.`;
  }
  
  // Handle missing required arguments
  if (errorMessage.includes("missing") && errorMessage.includes("argument")) {
    const paramNameMatch = error.message.match(/parameter ['"]?([^'"]+?)['"]?/);
    const paramName = paramNameMatch ? paramNameMatch[1] : "";
    
    return `Make sure you provide all required arguments to the function. ${paramName ? `The parameter '${paramName}' is missing.` : ""}`;
  }
  
  // Function not found
  if (errorMessage.includes("is not defined") || errorMessage.includes("is not a function")) {
    const funcNameMatch = error.message.match(/['"]?([^'"]+?)['"]?\s+is not/);
    const funcName = funcNameMatch ? funcNameMatch[1] : "";
    
    return `Check that '${funcName}' is defined and spelled correctly. It might be a typo or the function might not be defined in this scope.`;
  }
  
  return undefined;
}

/**
 * Improved error location finder specifically for function call errors
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
    
    // Special handling for function argument errors
    if (errorMsg.includes("too many") && errorMsg.includes("arguments")) {
      const funcNameMatch = error.message.match(/function ['"]?([^'"]+?)['"]?[.:\s]/);
      const funcName = funcNameMatch ? funcNameMatch[1] : null;
      
      if (funcName) {
        // Find the function call in the code
        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          const funcCallRegex = new RegExp(`\\(\\s*${escapeRegExp(funcName)}\\s+`);
          
          if (funcCallRegex.test(lineText)) {
            // Find the position of the function name
            const funcPos = lineText.indexOf(funcName);
            if (funcPos >= 0) {
              // Count the number of arguments
              const afterFuncName = lineText.substring(funcPos + funcName.length);
              const argCount = countArguments(afterFuncName);
              
              // If the argument count looks suspicious (many arguments), this is likely our line
              if (argCount >= 2) {
                // Find the column of the first argument after the function name
                let firstArgPos = lineText.indexOf(funcName) + funcName.length;
                while (firstArgPos < lineText.length && /\s/.test(lineText[firstArgPos])) {
                  firstArgPos++;
                }
                
                return {
                  line: i + 1,
                  column: firstArgPos + 1 // Convert to 1-based column index
                };
              }
            }
          }
        }
      }
    }
    
    // Missing required arguments
    if (errorMsg.includes("missing") && errorMsg.includes("argument")) {
      const funcNameMatch = error.message.match(/function ['"]?([^'"]+?)['"]?/);
      const funcName = funcNameMatch ? funcNameMatch[1] : null;
      
      if (funcName) {
        // Find the function call in the code
        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          const funcCallRegex = new RegExp(`\\(\\s*${escapeRegExp(funcName)}\\s*`);
          
          if (funcCallRegex.test(lineText)) {
            // Find the position of the function name
            const funcPos = lineText.indexOf(funcName);
            return {
              line: i + 1,
              column: funcPos + 1 // Convert to 1-based column index
            };
          }
        }
      }
    }
    
    // Default to searching for the function name or error keywords
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
 * Helper function to count arguments in a function call
 */
function countArguments(text: string): number {
  let count = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (inString) {
      if (char === '\\') {
        escaped = !escaped;
      } else if (char === '"' && !escaped) {
        inString = false;
      } else {
        escaped = false;
      }
      continue;
    }
    
    if (char === '"') {
      inString = true;
      continue;
    }
    
    if (char === '(' || char === '[' || char === '{') {
      depth++;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
      if (depth < 0) break; // End of the function call
    } else if (depth === 0 && /\S/.test(char) && !/\s/.test(char)) {
      // Non-whitespace character at depth 0, likely an argument
      count++;
      
      // Skip the rest of this argument
      while (i < text.length) {
        i++;
        if (i >= text.length || text[i] === ' ' || text[i] === ')') {
          break;
        }
      }
    }
  }
  
  return count;
}

/**
 * Helper function to escape regular expression special characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}