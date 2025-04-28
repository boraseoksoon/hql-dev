// core/src/common/runtime-error-handler.ts
// Maps JavaScript runtime errors back to HQL source locations

import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import { RuntimeError, ValidationError } from "./error.ts";
import { globalLogger as logger } from "../logger.ts";
import { globalErrorReporter } from "./error-handler.ts";

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
 * Get the HQL file path from a JavaScript file path
 */
function getHqlFileFromJs(jsFile: string): string | undefined {
  const mapping = fileMappings.get(jsFile);
  if (mapping) {
    return mapping.hqlFile;
  }
  
  // Try to infer from file path
  if (jsFile.includes("_hql_") && jsFile.endsWith(".js")) {
    // This is likely a transpiled HQL file in a temp directory
    // Try to find corresponding .hql file based on conventions
    const fileName = path.basename(jsFile, ".js");
    const possibleHqlName = fileName.replace(/\.transpiled$/, "") + ".hql";
    
    // Look in common directory patterns
    const searchPaths = [
      Deno.cwd(),
      path.join(Deno.cwd(), "src"),
      path.join(Deno.cwd(), "lib")
    ];
    
    for (const searchPath of searchPaths) {
      const possiblePath = path.join(searchPath, possibleHqlName);
      try {
        const stat = Deno.statSync(possiblePath);
        if (stat.isFile) {
          logger.debug(`Inferred HQL file ${possiblePath} from JS file ${jsFile}`);
          return possiblePath;
        }
      } catch (_e) {
        // File doesn't exist, continue to next search path
      }
    }
  }
  
  return undefined;
}

/**
 * Map a JavaScript source location to an HQL source location
 */
function mapJsLocationToHql(
  jsFile: string, 
  jsLine: number, 
  jsColumn: number
): { file: string; line: number; column: number } | undefined {
  const hqlFile = getHqlFileFromJs(jsFile);
  if (!hqlFile) {
    return undefined;
  }
  
  const mapping = fileMappings.get(jsFile);
  if (!mapping) {
    // If no explicit mapping, use a simple heuristic
    return {
      file: hqlFile,
      line: Math.max(1, jsLine - 2), // Rough heuristic: HQL lines are usually ~2 lines before JS
      column: Math.max(1, jsColumn - 1)
    };
  }
  
  // Use registered line mapping if available
  let hqlLine = jsLine;
  if (mapping.lineMap.has(jsLine)) {
    hqlLine = mapping.lineMap.get(jsLine)!;
  } else {
    // Find closest line mapping
    let closest = Number.MAX_SAFE_INTEGER;
    let closestLine = jsLine;
    
    for (const [mappedJsLine, mappedHqlLine] of mapping.lineMap.entries()) {
      const distance = Math.abs(mappedJsLine - jsLine);
      if (distance < closest) {
        closest = distance;
        closestLine = mappedHqlLine;
      }
    }
    
    hqlLine = closestLine;
  }
  
  // Use column mapping if available
  let hqlColumn = jsColumn;
  const columnKey = `${jsLine}:${jsColumn}`;
  if (mapping.columnMap.has(columnKey)) {
    hqlColumn = mapping.columnMap.get(columnKey)!;
  }
  
  return {
    file: hqlFile,
    line: hqlLine,
    column: hqlColumn
  };
}

/**
 * Extract file, line, and column information from an error stack
 */
function extractLocationFromStack(stack: string): { file: string; line: number; column: number } | undefined {
  // Match file paths with line:column information in the stack trace
  const stackLineRegex = /at\s+.*\(?((?:\/|[a-zA-Z]:\\|file:\/\/)[^:)]+):(\d+):(\d+)\)?/;
  const match = stack.match(stackLineRegex);
  
  if (match) {
    const [_, filePath, lineStr, colStr] = match;
    
    // Convert to numbers
    const line = parseInt(lineStr, 10);
    const column = parseInt(colStr, 10);
    
    // Skip internal Deno modules
    if (filePath.includes("deno:") || filePath.includes("$deno$")) {
      return undefined;
    }
    
    return { 
      file: filePath, 
      line, 
      column 
    };
  }
  
  return undefined;
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
    logger.debug(`Error reading context lines from ${filePath}: ${error.message}`);
    return [];
  }
}

/**
 * Find the closest matching HQL files for a given error location
 */
async function findClosestHqlFiles(
  errorLocation: { file: string; line: number; column: number }
): Promise<{ hqlFile: string; line: number; column: number }[]> {
  // First check if we have a direct mapping
  const hqlLocation = mapJsLocationToHql(
    errorLocation.file,
    errorLocation.line,
    errorLocation.column
  );
  
  if (hqlLocation) {
    return [{ hqlFile: hqlLocation.file, line: hqlLocation.line, column: hqlLocation.column }];
  }
  
  // If we don't have a direct mapping, try to find HQL files in the project
  // that might be related to the error
  const candidates: { hqlFile: string; line: number; column: number }[] = [];
  
  if (runtimeContext.currentHqlFile) {
    // If we know the current HQL file, add it as a candidate
    candidates.push({
      hqlFile: runtimeContext.currentHqlFile,
      line: errorLocation.line,
      column: errorLocation.column
    });
  }
  
  // Look in common directories for HQL files
  const searchDirs = [
    Deno.cwd(),
    path.join(Deno.cwd(), "src"),
    path.join(Deno.cwd(), "lib")
  ];
  
  for (const dir of searchDirs) {
    try {
      for await (const entry of Deno.readDir(dir)) {
        if (entry.isFile && entry.name.endsWith(".hql")) {
          candidates.push({
            hqlFile: path.join(dir, entry.name),
            line: errorLocation.line,
            column: errorLocation.column
          });
        }
      }
    } catch (_e) {
      // Directory doesn't exist or can't be read, skip it
    }
  }
  
  return candidates;
}

/**
 * Create a suggestion based on the error type and message
 */
function createSuggestionForError(error: Error): string | undefined {
  const errorMessage = error.message.toLowerCase();
  
  // Uncaught TypeError: Cannot read property/Cannot read properties of
  if (errorMessage.includes("cannot read") && 
      (errorMessage.includes("property") || errorMessage.includes("properties"))) {
    return "Check that the object is not null or undefined before accessing its properties.";
  }
  
  // Uncaught ReferenceError: X is not defined
  if (errorMessage.includes("is not defined")) {
    const variableName = errorMessage.match(/(?:variable |['"](.*?)['"] )?is not defined/)?.[1];
    if (variableName) {
      return `Make sure '${variableName}' is defined before using it. Did you forget to import it or declare it with 'let'?`;
    }
    return "Make sure all variables are defined before using them.";
  }
  
  // TypeError: X is not a function
  if (errorMessage.includes("is not a function")) {
    return "Verify that you're calling a valid function and check for typos in the function name.";
  }
  
  // SyntaxError: Unexpected token
  if (errorMessage.includes("unexpected token")) {
    return "Check the syntax around this area for mismatched parentheses, brackets, or other syntax errors.";
  }
  
  // Default suggestion
  return "Double-check the code around this area for potential issues.";
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
    }
    
    // Call the original console.error
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
    logger.debug(`Handling runtime error: ${error.message}`);
    
    // Check if we have a stack trace
    if (!error.stack) {
      // If no stack trace, just report the error as is
      await globalErrorReporter.reportError(error);
      return;
    }
    
    // Extract location from stack trace
    const jsLocation = extractLocationFromStack(error.stack);
    if (!jsLocation) {
      // If we can't extract a location, just report the error as is
      await globalErrorReporter.reportError(error);
      return;
    }
    
    // Find relevant HQL files
    const hqlCandidates = await findClosestHqlFiles(jsLocation);
    
    if (hqlCandidates.length === 0) {
      // If no HQL candidates found, report with JS location
      await globalErrorReporter.reportError(error);
      return;
    }
    
    // Use the first HQL candidate (most likely match)
    const hqlLocation = hqlCandidates[0];
    
    // Read context lines from the HQL file
    const contextLines = await readContextLines(hqlLocation.hqlFile, hqlLocation.line);
    
    // Create a suggestion
    const suggestion = createSuggestionForError(error);
    
    // Create a RuntimeError with HQL source location
    const hqlError = new RuntimeError(
      error.message,
      {
        filePath: hqlLocation.hqlFile,
        line: hqlLocation.line,
        column: hqlLocation.column,
      }
    );
    
    // Set the context lines
    hqlError.contextLines = contextLines;
    
    // Override the suggestion method
    if (suggestion) {
      hqlError.getSuggestion = () => suggestion;
    }
    
    // Report the error with the enhanced HQL information
    await globalErrorReporter.reportError(hqlError, true);
  } catch (handlerError) {
    // If our error handler fails, log it and fallback to reporting the original error
    logger.error(`Error in runtime error handler: ${handlerError.message}`);
    await globalErrorReporter.reportError(error);
  }
}

/**
 * Initialize the HQL runtime error handling system
 */
export function initializeErrorHandling(): void {
  installGlobalErrorHandler();
  logger.debug("HQL error handling system initialized");
}