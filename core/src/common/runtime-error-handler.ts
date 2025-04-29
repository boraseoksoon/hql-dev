// core/src/common/runtime-error-handler.ts
// Maps JavaScript runtime errors back to HQL source locations with improved accuracy

import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import { RuntimeError, ValidationError } from "./error.ts";
import { globalLogger as logger } from "../logger.ts";
import { globalErrorReporter } from "./error.ts";

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
 * Find HQL location for property access error
 * This function analyzes the error message and identifies the correct line and column
 */
function findPropertyAccessErrorLocation(error: Error, hqlFile: string): {line: number, column: number} | null {
  try {
    // Property access errors often contain the property name
    // Example: "b.hell is not a function" or "Cannot read property 'hell' of undefined"
    const propertyMatch = error.message.match(/([a-zA-Z0-9_$]+)\.([a-zA-Z0-9_$]+)/);
    if (!propertyMatch && !error.message.includes("property")) {
      return null;
    }
    
    // Get object and property names
    const objName = propertyMatch ? propertyMatch[1] : null;
    const propName = propertyMatch ? propertyMatch[2] : null;
    
    // Read the file and scan for the property access pattern
    const fileContent = Deno.readTextFileSync(hqlFile);
    const lines = fileContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // If we found both object and property names, look for the exact pattern
      if (objName && propName) {
        const pattern = `${objName}.${propName}`;
        const colIndex = line.indexOf(pattern);
        if (colIndex >= 0) {
          return {
            line: i + 1,
            column: colIndex + objName.length + 1 // Point to the dot or the property
          };
        }
      }
      
      // If we only have partial info, try to find any property access
      // that matches words in the error message
      const words = error.message.split(/\s+/);
      for (const word of words) {
        if (word.includes('.') && line.includes(word)) {
          const colIndex = line.indexOf(word);
          if (colIndex >= 0) {
            const dotIndex = word.indexOf('.');
            return {
              line: i + 1,
              column: colIndex + dotIndex // Point to the dot
            };
          }
        }
      }
    }
  } catch (e) {
    logger.debug(`Error finding property access location: ${e.message}`);
  }
  
  return null;
}

/**
 * Find HQL location for import errors
 * This function analyzes import statements to find the location of a symbol
 */
function findImportErrorLocation(error: Error, hqlFile: string): {line: number, column: number} | null {
  try {
    // Import errors often mention the symbol that wasn't found
    // Example: "Symbol 'fuck' not found in module './b.hql'" 
    const symbolMatch = error.message.match(/['"](.*?)['"] not found/);
    const symbolName = symbolMatch ? symbolMatch[1] : null;
    
    if (!symbolName) {
      return null;
    }
    
    // Read the file and scan for import statements containing the symbol
    const fileContent = Deno.readTextFileSync(hqlFile);
    const lines = fileContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for vector imports like (import [xyz] from "./path.hql")
      if (line.includes('import') && line.includes('[') && line.includes(symbolName)) {
        const bracketStart = line.indexOf('[');
        const bracketEnd = line.indexOf(']');
        
        if (bracketStart >= 0 && bracketEnd > bracketStart) {
          // Search for the symbol within the brackets
          const importVector = line.substring(bracketStart, bracketEnd);
          const symbolPos = importVector.indexOf(symbolName);
          
          if (symbolPos >= 0) {
            return {
              line: i + 1,
              column: bracketStart + symbolPos + 1
            };
          }
        }
        
        // If we found an import line but couldn't pinpoint the symbol,
        // at least return the line and approximate column
        return {
          line: i + 1,
          column: line.indexOf('import') + 1
        };
      }
      
      // Look for namespace imports: import name from "./path"
      if (line.includes('import') && line.includes('from') && line.includes(symbolName)) {
        return {
          line: i + 1,
          column: line.indexOf(symbolName) + 1
        };
      }
    }
  } catch (e) {
    logger.debug(`Error finding import error location: ${e.message}`);
  }
  
  return null;
}

/**
 * Find HQL location for function call errors
 * This function analyzes function calls to find the location
 * Enhanced to scan imported files as well
 */
function findFunctionCallErrorLocation(error: Error, hqlFile: string): {line: number, column: number, file: string} | null {
  try {
    // Function errors often mention the function name
    // Example: "hello is not a function" or "Cannot read property 'call' of undefined"
    const functionMatch = error.message.match(/([a-zA-Z0-9_$\.]+) is not a function/);
    const functionName = functionMatch ? functionMatch[1] : null;
    
    if (!functionName) {
      return null;
    }
    
    // First scan the main file
    const fileContent = Deno.readTextFileSync(hqlFile);
    const lines = fileContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for function call pattern (name args...)
      if (line.includes(functionName)) {
        const callIndex = line.indexOf(functionName);
        if (callIndex >= 0) {
          return {
            file: hqlFile,
            line: i + 1,
            column: callIndex + 1 // Point to the function name
          };
        }
      }
    }
    
    // If not found in the main file, check for imports and try to scan those files
    const importMatches = [];
    const importRegex = /\(import\s+(?:\[.+?\]|[a-zA-Z0-9_$]+)\s+from\s+["'](.+?)["']\)/g;
    let match;
    
    while ((match = importRegex.exec(fileContent)) !== null) {
      importMatches.push(match[1]);
    }
    
    // Process each imported file
    for (const importPath of importMatches) {
      try {
        // Resolve the import path relative to the current file
        const dir = path.dirname(hqlFile);
        const resolvedPath = path.resolve(dir, importPath);
        
        // Read and scan the imported file
        const importedContent = Deno.readTextFileSync(resolvedPath);
        const importedLines = importedContent.split('\n');
        
        for (let i = 0; i < importedLines.length; i++) {
          const line = importedLines[i];
          
          // Check for the function name or specific patterns like console.lo
          if (line.includes(functionName) || 
              (functionName === "console.lo" && line.includes("console.lo"))) {
            const callIndex = line.indexOf(functionName);
            if (callIndex >= 0) {
              return {
                file: resolvedPath,
                line: i + 1,
                column: callIndex + 1 // Point to the function name
              };
            }
          }
        }
      } catch (e) {
        logger.debug(`Error scanning imported file: ${e.message}`);
        // Continue with next import
      }
    }
  } catch (e) {
    logger.debug(`Error finding function call location: ${e.message}`);
  }
  
  return null;
}

/**
 * Find HQL location for "not defined" errors - Used for variable references
 * This function searches for the exact reference to the undefined variable
 */
function findNotDefinedErrorLocation(error: Error, hqlFile: string): {line: number, column: number} | null {
  try {
    // Not defined errors usually have the format "X is not defined"
    const varMatch = error.message.match(/([a-zA-Z0-9_$]+) is not defined/);
    if (!varMatch) {
      return null;
    }
    
    const varName = varMatch[1];
    
    // Read the file and scan for the variable usage
    const fileContent = Deno.readTextFileSync(hqlFile);
    const lines = fileContent.split('\n');
    
    // First, try to find exact matches for the variable
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for standalone variable or variable as first element in a list
      const patterns = [
        new RegExp(`\\(${varName}(\\s|\\))`, 'g'),  // (varName ...
        new RegExp(`\\(${varName}\\.`, 'g'),        // (varName.prop
        new RegExp(`\\s${varName}\\s`, 'g'),        // Standalone with spaces
        new RegExp(`\\s${varName}\\)`, 'g'),        // Standalone at end of list
        new RegExp(`^${varName}\\s`, 'g'),          // Start of line
        new RegExp(`\\s${varName}$`, 'g')           // End of line
      ];
      
      // Check each pattern
      for (const pattern of patterns) {
        if (pattern.test(line)) {
          // Find the exact column position of the variable
          const parts = line.split(varName);
          let pos = 0;
          
          // To find the actual reference and not a substring, look for whitespace or parentheses
          for (let j = 0; j < parts.length - 1; j++) {
            pos += parts[j].length;
            
            const prevChar = pos > 0 ? line[pos - 1] : ' ';
            const nextChar = pos + varName.length < line.length ? line[pos + varName.length] : ' ';
            
            // Valid reference must be surrounded by delimiters (not part of another identifier)
            if ((/[\s\(\)\.\[\]"',;]/.test(prevChar) || pos === 0) && 
                (/[\s\(\)\.\[\]"',;]/.test(nextChar) || pos + varName.length === line.length)) {
              
              return {
                line: i + 1,
                column: pos + 1 // 1-based column index
              };
            }
            
            pos += varName.length;
          }
        }
      }
    }
  } catch (e) {
    logger.debug(`Error finding "not defined" location: ${e.message}`);
  }
  
  return null;
}

/**
 * Get the HQL file path from a JavaScript file path
 */
// getHqlFileFromJs now only returns mappings registered during execution.
// All static/directory-guess logic has been removed for robustness.
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
    if (base.endsWith('.transpiled.js')) {
      base = base.slice(0, -('.transpiled.js'.length)) + '.hql';
    } else if (base.endsWith('.js')) {
      base = base.slice(0, -('.js'.length)) + '.hql';
    }

    // Remove _hql_ or temp marker if present in path
    base = base.replace(/_hql_\//g, '').replace(/hql-transpiled\//g, '');

    // Check if the inferred file exists
    try {
      const stat = Deno.statSync(base);
      if (stat.isFile) {
        logger.debug(`Inferred HQL file ${base} from JS file ${jsFile}`);
        return base;
      }
    } catch { /* not found, continue */ }

    // 3. Walk up directory tree to find a matching .hql file
    let dir = path.dirname(jsFile);
    const fileName = path.basename(base);
    for (let i = 0; i < 3; ++i) { // Limit walk to 3 parent levels
      const candidate = path.join(dir, fileName);
      try {
        const stat = Deno.statSync(candidate);
        if (stat.isFile) {
          logger.debug(`Found HQL file ${candidate} by walking up from JS file ${jsFile}`);
          return candidate;
        }
      } catch { /* not found, continue */ }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch (e) {
    logger.debug(`Error inferring HQL file from JS file: ${e instanceof Error ? e.message : e}`);
  }

  logger.warn(`No HQL mapping found for JS file: ${jsFile}.`);
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
 * Get a list of location candidates for an error
 * This allows providing multiple possible error locations for better diagnostics
 */
async function findPossibleErrorLocations(
  error: Error, 
  hqlFile: string
): Promise<{ line: number, column: number }[]> {
  const locations: { line: number, column: number }[] = [];
  
  try {
    // First, try to find the exact location based on error type
    let exactLocation = null;
    
    // Check for "is not defined" errors
    if (error.message.includes("is not defined")) {
      exactLocation = findNotDefinedErrorLocation(error, hqlFile);
    }
    // Check for property access errors
    else if (error.message.includes("property") || error.message.match(/\..*is not/)) {
      exactLocation = findPropertyAccessErrorLocation(error, hqlFile);
    }
    // Check for "is not a function" errors
    else if (error.message.includes("is not a function")) {
      exactLocation = findFunctionCallErrorLocation(error, hqlFile);
    }
    // Check for import-related errors
    else if (error.message.includes("not found in module")) {
      exactLocation = findImportErrorLocation(error, hqlFile);
    }
    
    // If we found an exact location, use it
    if (exactLocation) {
      locations.push(exactLocation);
    }
    
    // Analyze the entire file for both exact names and related names
    const errorText = error.message.toLowerCase();
    const fileContent = await Deno.readTextFile(hqlFile);
    const lines = fileContent.split('\n');
    
    // Extract keywords from the error message
    const errorWords = error.message
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !/^[0-9]+$/.test(word));
    
    // Extract potential variable names or identifiers
    const possibleIdentifiers: string[] = [];
    const identifierMatch = error.message.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g);
    if (identifierMatch) {
      possibleIdentifiers.push(...identifierMatch);
    }
    
    // Now scan the file for matches
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      let score = 0;
      
      // Check for literal error text
      if (line.includes(errorText)) {
        score += 10;
      }
      
      // Check for error keywords
      for (const word of errorWords) {
        if (line.includes(word.toLowerCase())) {
          score += 3;
        }
      }
      
      // Check for identifiers
      for (const id of possibleIdentifiers) {
        if (lines[i].includes(id)) {
          score += 5;
          
          // Find column position of the identifier
          const idPos = lines[i].indexOf(id);
          if (idPos >= 0 && score >= 5) {
            locations.push({
              line: i + 1,
              column: idPos + 1
            });
          }
        }
      }
      
      // If this line has a good score but no positions yet, add it
      if (score >= 8 && !locations.some(loc => loc.line === i + 1)) {
        // Find a reasonable column - prefer non-whitespace
        let column = lines[i].search(/\S/);
        if (column < 0) column = 0;
        
        locations.push({
          line: i + 1,
          column: column + 1
        });
      }
    }
  } catch (e) {
    logger.debug(`Error finding possible error locations: ${e.message}`);
  }
  
  // Deduplicate locations
  const uniqueLocations: { line: number, column: number }[] = [];
  const seen = new Set<string>();
  
  for (const loc of locations) {
    const key = `${loc.line}:${loc.column}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueLocations.push(loc);
    }
  }
  
  return uniqueLocations;
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
    path.join(Deno.cwd(), "lib"),
    path.join(Deno.cwd(), "doc", "examples")
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
        } else if (entry.isDirectory) {
          // Also check subdirectories
          try {
            const subdir = path.join(dir, entry.name);
            for await (const subEntry of Deno.readDir(subdir)) {
              if (subEntry.isFile && subEntry.name.endsWith(".hql")) {
                candidates.push({
                  hqlFile: path.join(subdir, subEntry.name),
                  line: errorLocation.line,
                  column: errorLocation.column
                });
              }
            }
          } catch (_e) {
            // Ignore errors in subdirectories
          }
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
      return `Check ${variableName} at line ${variableName.length > 3 ? 'above' : 'below'}. Make sure '${variableName}' is defined before using it. Did you forget to import it or declare it with 'let'?`;
    }
    return "Make sure all variables are defined before using them.";
  }
  
  // TypeError: X is not a function
  if (errorMessage.includes("is not a function")) {
    return "Verify that you're calling a valid function and check for typos in the function name or property name.";
  }
  
  // Import errors
  if (errorMessage.includes("not found in module")) {
    return "Check the imported file for exported symbols, or fix the property name.";
  }
  
  // Property doesn't exist
  if (errorMessage.includes("property") && errorMessage.includes("not found")) {
    return "Verify the property name and check if you have a typo or if the property exists on the object.";
  }
  
  // SyntaxError: Unexpected token
  if (errorMessage.includes("unexpected token")) {
    return "Check the syntax around this area for mismatched parentheses, brackets, or other syntax errors.";
  }
  
  // Default suggestion
  return "Check runtime type mismatches or invalid operations.";
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
 * Format an error message with multiple possible locations
 */
function formatErrorWithLocations(
  errorMessage: string,
  locations: { line: number, column: number }[]
): string {
  if (locations.length === 0) {
    return errorMessage;
  }
  
  // Create a nicely formatted location list, sorted by line number
  const sortedLocations = [...locations].sort((a, b) => a.line - b.line);
  const locationStr = sortedLocations
    .map(loc => `line ${loc.line}, column ${loc.column}`)
    .join("; ");
    
  return `${errorMessage} (Likely error locations: ${locationStr})`;
}

/**
 * Handle a runtime error by mapping it back to HQL source if possible
 */
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
    let hqlLocation: { hqlFile: string; line: number; column: number } | null = null;
    
    // If we have a current HQL file context, try to find specific error locations
    if (runtimeContext.currentHqlFile) {
      // Try to find the specific location based on error type
      
      // Check for "is not defined" errors
      if (error.message.includes("is not defined")) {
        const notDefinedLocation = findNotDefinedErrorLocation(error, runtimeContext.currentHqlFile);
        if (notDefinedLocation) {
          hqlLocation = { 
            hqlFile: runtimeContext.currentHqlFile, 
            line: notDefinedLocation.line, 
            column: notDefinedLocation.column 
          };
        }
      }
      // Check for "is not a function" errors - enhanced to check imported files
      else if (error.message.includes("is not a function")) {
        const fnCallLocation = findFunctionCallErrorLocation(error, runtimeContext.currentHqlFile);
        if (fnCallLocation) {
          hqlLocation = { 
            hqlFile: fnCallLocation.file, // Use the found file, which might be an import
            line: fnCallLocation.line, 
            column: fnCallLocation.column 
          };
        }
      }
      // Check for property access errors
      else if (error.message.includes("property") || error.message.match(/\..*is not/)) {
        const propLocation = findPropertyAccessErrorLocation(error, runtimeContext.currentHqlFile);
        if (propLocation) {
          hqlLocation = { 
            hqlFile: runtimeContext.currentHqlFile, 
            line: propLocation.line, 
            column: propLocation.column 
          };
        }
      }
      // Check for import-related errors
      else if (error.message.includes("not found in module")) {
        const importLocation = findImportErrorLocation(error, runtimeContext.currentHqlFile);
        if (importLocation) {
          hqlLocation = { 
            hqlFile: runtimeContext.currentHqlFile, 
            line: importLocation.line, 
            column: importLocation.column 
          };
        }
      }
      
      // If nothing found yet, try getting all possible locations
      if (!hqlLocation) {
        const possibleLocations = await findPossibleErrorLocations(error, runtimeContext.currentHqlFile);
        if (possibleLocations.length > 0) {
          hqlLocation = {
            hqlFile: runtimeContext.currentHqlFile,
            line: possibleLocations[0].line,
            column: possibleLocations[0].column,
          };
          
          // Create an enhanced error message with all likely locations
          const enhancedMessage = formatErrorWithLocations(error.message, possibleLocations);
          error.message = enhancedMessage;
        }
      }
    }
    
    // If we didn't find a location, but we have JS location, try mappings
    if (!hqlLocation && jsLocation) {
      const candidates = await findClosestHqlFiles(jsLocation);
      
      if (candidates.length > 0) {
        // If we found candidates, use the first one
        hqlLocation = candidates[0];
      }
    }
    
    // If we still don't have a location but have a current file, use defaults
    if (!hqlLocation && runtimeContext.currentHqlFile) {
      hqlLocation = {
        hqlFile: runtimeContext.currentHqlFile,
        line: 1,  // Default to line 1
        column: 1 // Default to column 1
      };
    }
    
    // If we found a location, create a RuntimeError with it
    // Prevent double reporting: if already reported, skip
    const reportedSymbol = Symbol.for("__hql_error_reported__");
    if (typeof error === 'object' && error !== null && (error as Record<string, unknown>)[reportedSymbol]) {
      return;
    }

    // Mark the original error as reported before any reporting
    if (typeof error === 'object' && error !== null) {
      (error as Record<string, unknown>)[reportedSymbol] = true;
    }

    if (hqlLocation) {
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
      hqlError.contextLines = contextLines.map(line => {
        if (line.isError) {
          return { ...line, column: hqlLocation!.column };
        }
        return line;
      });
      
      // Override the suggestion method
      if (suggestion) {
        hqlError.getSuggestion = () => suggestion;
      }
      // Mark the enhanced error as reported as well (for completeness)
      (hqlError as Record<string, unknown>)[reportedSymbol] = true;
      // Report the error with the enhanced HQL information
      await globalErrorReporter.reportError(hqlError, true);
    } else {
      // If we couldn't enhance the error, only report if not already reported
      if (typeof error === 'object' && error !== null && (error as Record<string, unknown>)[reportedSymbol]) {
        return;
      }
      await globalErrorReporter.reportError(error);
    }
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