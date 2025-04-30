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
): Promise<{ line: number, column: number }[]> {
  const locations: { line: number, column: number }[] = [];
  const errorMsg = error.message.toLowerCase();
  
  // Main error pattern detection
  try {
    // Check for different error patterns and use specific finders
    if (errorMsg.includes(ERROR_PATTERNS.IS_NOT_DEFINED)) {
      const location = findNotDefinedErrorLocation(error, hqlFile);
      if (location) locations.push(location);
    }
    else if (errorMsg.includes(ERROR_PATTERNS.PROPERTY_OF) || errorMsg.match(/\..*is not/)) {
      const location = findPropertyAccessErrorLocation(error, hqlFile);
      if (location) locations.push(location);
    }
    else if (errorMsg.includes(ERROR_PATTERNS.IS_NOT_FUNCTION)) {
      const location = findFunctionCallErrorLocation(error, hqlFile);
      if (location) locations.push({ line: location.line, column: location.column });
    }
    else if (errorMsg.includes(ERROR_PATTERNS.NOT_FOUND_IN_MODULE)) {
      const location = findImportErrorLocation(error, hqlFile);
      if (location) locations.push(location);
    }
    else if (errorMsg.includes(ERROR_PATTERNS.TOO_MANY_ARGUMENTS) && errorMsg.includes(ERROR_PATTERNS.ARGUMENTS)) {
      const location = findTooManyArgumentsErrorLocation(error, hqlFile);
      if (location) locations.push(location);
    }
    else if (errorMsg.includes(ERROR_PATTERNS.INVALID) && errorMsg.includes(ERROR_PATTERNS.FORM)) {
      const location = findInvalidFormLocation(error, hqlFile);
      if (location) locations.push(location);
    }
    else if (errorMsg.includes("requires exactly") || 
             errorMsg.includes(ERROR_PATTERNS.UNEXPECTED_TOKEN) || 
             errorMsg.includes("missing")) {
      const location = findSpecificSyntaxErrorLocation(error, hqlFile);
      if (location) locations.push(location);
    }
    
    // If no specific location found, search for keywords in the error message
    if (locations.length === 0) {
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
      const fileContent = await Deno.readTextFile(hqlFile);
      const lines = fileContent.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        let score = 0;
        
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
              break;
            }
          }
        }
        
        // If no identifiers found, check keywords
        if (score === 0) {
          for (const word of errorWords) {
            if (lines[i].toLowerCase().includes(word.toLowerCase())) {
              score += 2;
            }
          }
          
          if (score >= 4) {
            // Find a reasonable column - prefer non-whitespace
            let column = lines[i].search(/\S/);
            if (column < 0) column = 0;
            
            locations.push({
              line: i + 1,
              column: column + 1
            });
          }
        }
      }
    }
  } catch (e) {
    logger.debug(`Error finding possible error locations: ${e instanceof Error ? e.message : String(e)}`);
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
 * Find HQL location for property access error
 */
function findPropertyAccessErrorLocation(error: Error, hqlFile: string): {line: number, column: number} | null {
  try {
    // Property access errors often contain the property name
    // Example: "b.hell is not a function" or "Cannot read property 'hell' of undefined"
    const propertyMatch = error.message.match(/([a-zA-Z0-9_$]+)\.([a-zA-Z0-9_$]+)/);
    if (!propertyMatch && !error.message.toLowerCase().includes(ERROR_PATTERNS.PROPERTY_OF)) {
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
    logger.debug(`Error finding property access location: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  return null;
}

/**
 * Find import error locations using a generalized approach
 */
function findImportErrorLocation(error: Error, hqlFile: string): {line: number, column: number} | null {
  try {
    // Import errors often mention issues with the format
    const fileContent = Deno.readTextFileSync(hqlFile);
    const lines = fileContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for import statements
      if (line.includes('import')) {
        // For vector imports like (import [xyz] from "./path.hql")
        if (line.includes('[') && line.includes(']')) {
          const bracketStart = line.indexOf('[');
          const bracketEnd = line.indexOf(']');
          
          // Check if the keyword after the brackets is not 'from'
          const afterBracket = line.substring(bracketEnd + 1).trim();
          if (!afterBracket.startsWith('from')) {
            // The error is likely in the keyword that should be 'from'
            const invalidKeywordPos = line.indexOf(afterBracket.split(' ')[0], bracketEnd);
            if (invalidKeywordPos >= 0) {
              return {
                line: i + 1,
                column: invalidKeywordPos + 1
              };
            }
          }
        }
        
        // For namespace imports: import name from "./path"
        else if (line.includes('import') && !line.includes('[')) {
          const importPos = line.indexOf('import');
          const afterImport = line.substring(importPos + 6).trim(); // 'import' is 6 chars
          
          // Split by spaces to get tokens
          const tokens = afterImport.split(/\s+/);
          
          // If we have at least 2 tokens, check if the second one is not 'from'
          if (tokens.length >= 2 && tokens[1] !== 'from') {
            // Find position of the incorrect keyword
            const invalidKeywordPos = line.indexOf(tokens[1], importPos + 6);
            if (invalidKeywordPos >= 0) {
              return {
                line: i + 1,
                column: invalidKeywordPos + 1
              };
            }
          }
        }
        
        // If we couldn't pinpoint the exact error, just return the import line
        return {
          line: i + 1,
          column: line.indexOf('import') + 1
        };
      }
    }
  } catch (e) {
    logger.debug(`Error finding import error location: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  return null;
}

/**
 * Find HQL location for function call errors
 */
function findFunctionCallErrorLocation(error: Error, hqlFile: string): {line: number, column: number, file: string} | null {
  try {
    // Function errors often mention the function name
    // Example: "hello is not a function" or "Cannot read property 'call' of undefined"
    const functionMatch = error.message.match(ERROR_REGEX.NOT_FUNCTION);
    const functionName = functionMatch ? functionMatch[1] : null;
    
    if (!functionName) {
      return null;
    }
    
    // First scan the main file
    const fileContent = Deno.readTextFileSync(hqlFile);
    const lines = fileContent.split('\n');
    
    // Also look for function definitions
    let fnDefLine = -1;
    let fnDefColumn = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for function definition pattern
      if ((line.includes('(fn ') || line.includes('(fx ')) && line.includes(functionName)) {
        // This could be a function definition
        const fnKeywordPos = line.indexOf('fn ');
        const fxKeywordPos = line.indexOf('fx ');
        const keywordPos = fnKeywordPos >= 0 ? fnKeywordPos : fxKeywordPos;
        
        if (keywordPos >= 0) {
          const afterKeyword = line.substring(keywordPos + 3); // "fn " or "fx " is 3 chars
          const nameStartPos = afterKeyword.search(/\S/); // First non-whitespace
          
          if (nameStartPos >= 0 && afterKeyword.substring(nameStartPos).startsWith(functionName)) {
            fnDefLine = i + 1;
            fnDefColumn = keywordPos + 3 + nameStartPos + 1; // +1 for 1-based indexing
          }
        }
      }
      
      // Look for function call pattern (name args...)
      if (line.includes(functionName) && line.includes('(')) {
        // Verify this is a function call and not a definition
        // Simple heuristic: if it appears after ( and not after (fn or (fx
        const openParenPos = line.indexOf('(');
        const fnPos = line.indexOf('(fn ');
        const fxPos = line.indexOf('(fx ');
        
        // Skip if this is a function definition
        if ((fnPos === openParenPos || fxPos === openParenPos) && line.substring(fnPos + 4).includes(functionName)) {
          continue;
        }
        
        const callIndex = line.indexOf(functionName);
        if (callIndex >= 0) {
          // Check if this is likely a function call by looking for a pattern like (functionName ...
          // This is a simple heuristic and might not catch all cases
          let isLikelyCall = false;
          
          for (let pos = callIndex - 1; pos >= 0; pos--) {
            const char = line[pos];
            if (char === '(') {
              isLikelyCall = true;
              break;
            } else if (!/\s/.test(char)) {
              // Non-whitespace before function name, not a simple call
              break;
            }
          }
          
          if (isLikelyCall) {
            return {
              file: hqlFile,
              line: i + 1,
              column: callIndex + 1 // Point to the function name
            };
          }
        }
      }
    }
    
    // If we found a function definition, return that as a fallback
    if (fnDefLine >= 0) {
      return {
        file: hqlFile,
        line: fnDefLine,
        column: fnDefColumn
      };
    }
    
    // If not found in the main file, check for imports
    // We'll scan for import statements to understand what modules are imported
    const imports: { name: string, path: string }[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('import') && line.includes('from')) {
        // Try to extract import path
        const fromIndex = line.indexOf('from');
        if (fromIndex >= 0) {
          // Look for the quoted path after "from"
          const afterFrom = line.substring(fromIndex + 4); // "from" is 4 chars
          const quoteMatch = afterFrom.match(/["']([^"']+)["']/);
          
          if (quoteMatch) {
            const importPath = quoteMatch[1];
            
            // For namespace import like "import b from './b.hql'"
            if (line.includes('import') && !line.includes('[')) {
              const importIndex = line.indexOf('import');
              const betweenImportAndFrom = line.substring(importIndex + 6, fromIndex).trim();
              // This is a rough approximation, might need more precise parsing
              imports.push({ name: betweenImportAndFrom, path: importPath });
            }
            
            // For vector imports like "import [hello] from './b.hql'"
            if (line.includes('[') && line.includes(']')) {
              const openBracket = line.indexOf('[');
              const closeBracket = line.indexOf(']');
              if (closeBracket > openBracket) {
                const importedSymbols = line.substring(openBracket + 1, closeBracket)
                  .split(/\s+/)
                  .map(s => s.trim())
                  .filter(s => s && s !== ',');
                
                for (const symbol of importedSymbols) {
                  imports.push({ name: symbol, path: importPath });
                }
              }
            }
          }
        }
      }
    }
    
    // Process each imported file
    for (const importInfo of imports) {
      try {
        // Resolve the import path relative to the current file
        const dir = path.dirname(hqlFile);
        const resolvedPath = path.resolve(dir, importInfo.path);
        
        // Skip if the imported file doesn't exist
        try {
          Deno.statSync(resolvedPath);
        } catch {
          continue; // File doesn't exist, skip
        }
        
        // Read and scan the imported file
        const importedContent = Deno.readTextFileSync(resolvedPath);
        const importedLines = importedContent.split('\n');
        
        for (let i = 0; i < importedLines.length; i++) {
          const line = importedLines[i];
          
          // Check for the function definition in the imported file
          if ((line.includes('(fn ') || line.includes('(fx ')) && line.includes(functionName)) {
            const fnKeywordPos = line.indexOf('fn ');
            const fxKeywordPos = line.indexOf('fx ');
            const keywordPos = fnKeywordPos >= 0 ? fnKeywordPos : fxKeywordPos;
            
            if (keywordPos >= 0) {
              const afterKeyword = line.substring(keywordPos + 3);
              const nameStartPos = afterKeyword.search(/\S/);
              
              if (nameStartPos >= 0 && afterKeyword.substring(nameStartPos).startsWith(functionName)) {
                return {
                  file: resolvedPath,
                  line: i + 1,
                  column: keywordPos + 3 + nameStartPos + 1
                };
              }
            }
          }
          
          // Also check for export statements
          if (line.includes('export') && line.includes(functionName)) {
            return {
              file: resolvedPath,
              line: i + 1,
              column: line.indexOf(functionName) + 1
            };
          }
        }
      } catch (e) {
        logger.debug(`Error scanning imported file: ${e instanceof Error ? e.message : String(e)}`);
        // Continue with next import
      }
    }
  } catch (e) {
    logger.debug(`Error finding function call location: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  return null;
}

/**
 * Find HQL location for "get" operation errors during transpilation
 */
function findGetCallErrorLocation(error: Error, hqlFile: string): {line: number, column: number} | null {
  try {
    // Special case for 'get' function that is inserted by the transpiler
    if (error.message.includes("get is not defined") || error.message.includes("get not defined")) {
      // Read file and look for object property access patterns or function calls with namespacing
      const fileContent = Deno.readTextFileSync(hqlFile);
      const lines = fileContent.split('\n');

      // Pattern: Look for unqualified names in call position like "bhello" instead of "b.hello"
      const getCallRegex = /\([a-zA-Z0-9_$]+\s+[a-zA-Z0-9_$.]+/;
      // Also look for import statements to correlate
      const importRegex = /\(import\s+([a-zA-Z0-9_$]+)\s+from\s/;
      
      // Note imported names
      const importedNames: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const importMatch = lines[i].match(importRegex);
        if (importMatch) {
          importedNames.push(importMatch[1]);
        }
      }
      
      // Find potential error locations
      for (let i = 0; i < lines.length; i++) {
        // Check for unqualified names first
        const getCallMatch = lines[i].match(getCallRegex);
        if (getCallMatch) {
          const callStart = getCallMatch.index || 0;
          // Verify this isn't an access of an imported name
          const tokens = getCallMatch[0].trim().substring(1).split(/\s+/);
          if (tokens.length >= 2) {
            const potentialFnName = tokens[0];
            const argName = tokens[1];
            
            // Check if this looks like a function call with a name that wasn't imported directly
            if (importedNames.includes(potentialFnName) && !argName.includes('.')) {
              return {
                line: i + 1,
                column: callStart + potentialFnName.length + 2 // Point to the argument
              };
            }
          }
        }
        
        // Also check for potential attempts to access attributes of imported modules without using dot
        for (const importName of importedNames) {
          // Look for pattern like (bhello...) instead of (b.hello...)
          const errorPattern = new RegExp(`\\(${importName}[a-zA-Z0-9_$]+`);
          const match = lines[i].match(errorPattern);
          if (match) {
            return {
              line: i + 1,
              column: match.index! + 1 // Point to the beginning of the incorrect reference
            };
          }
        }
      }
      
      // If we can't find a specific location, at least return line 1 as fallback
      return { line: 1, column: 1 };
    }
  } catch (e) {
    logger.debug(`Error finding get call location: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  return null;
}

/**
 * Find HQL location for "not defined" errors - Used for variable references
 */
function findNotDefinedErrorLocation(error: Error, hqlFile: string): {line: number, column: number} | null {
  try {
    // Not defined errors usually have the format "X is not defined"
    const varMatch = error.message.match(ERROR_REGEX.UNDEFINED_VAR);
    if (!varMatch) {
      return null;
    }
    
    const varName = varMatch[1];
    
    // Special case: if the variable is "get", this might be from our transpiler
    if (varName === ERROR_PATTERNS.GET_FUNCTION) {
      return findGetCallErrorLocation(error, hqlFile);
    }
    
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
    logger.debug(`Error finding "not defined" location: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  return null;
}

/**
 * Find HQL location for "too many arguments" errors in function calls
 */
function findTooManyArgumentsErrorLocation(error: Error, hqlFile: string): {line: number, column: number} | null {
  try {
    // Pattern: "Too many positional arguments in call to function 'X'"
    const fnMatch = error.message.match(ERROR_REGEX.ARGS_COUNT);
    if (!fnMatch) {
      return null;
    }
    
    const functionName = fnMatch[1];
    
    // Read the file and scan for calls to this function
    const fileContent = Deno.readTextFileSync(hqlFile);
    const lines = fileContent.split('\n');
    
    // Search for function calls with the pattern (functionName arg1 arg2 ...)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for function call patterns, ensuring this is a call not a definition
      if (line.includes(functionName) && !line.includes(`(fn ${functionName}`) && !line.includes(`(fx ${functionName}`)) {
        // Find the position of the function name in a call context
        let fnCallIndex = -1;
        let openParenPos = -1;
        
        // Match any occurrence of the function being called
        const fnCallRegex = new RegExp(`\\([\\s\\(]*${functionName}\\s+[^\\)]+`);
        const fnCallMatch = line.match(fnCallRegex);
        
        if (fnCallMatch) {
          openParenPos = fnCallMatch.index!;
          fnCallIndex = line.indexOf(functionName, openParenPos);
          
          if (fnCallIndex >= 0) {
            return {
              line: i + 1,
              column: fnCallIndex + 1 // Point to the function name
            };
          }
        }
      }
    }
  } catch (e) {
    logger.debug(`Error finding too many arguments location: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  return null;
}

/**
 * Find HQL location for invalid syntax errors
 */
function findInvalidFormLocation(error: Error, hqlFile: string): {line: number, column: number} | null {
  try {
    // Pattern: "Invalid X form"
    const syntaxMatch = error.message.match(/invalid\s+([a-zA-Z0-9_\-]+)\s+form/i);
    if (!syntaxMatch) {
      return null;
    }
    
    const syntaxElement = syntaxMatch[1];
    
    // Read the file and scan for the syntax element
    const fileContent = Deno.readTextFileSync(hqlFile);
    const lines = fileContent.split('\n');
    
    // Search for occurrences of this syntax element
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      // Look for patterns like (syntaxElement ...
      if (line.includes(`(${syntaxElement.toLowerCase()}`) || 
          line.includes(`( ${syntaxElement.toLowerCase()}`)) {
        
        // Find the position of the syntax element
        const elPos = line.indexOf(syntaxElement.toLowerCase());
        if (elPos >= 0) {
          return {
            line: i + 1,
            column: elPos + 1 // Point to the start of the syntax element
          };
        }
      }
    }
  } catch (e) {
    logger.debug(`Error finding invalid syntax location: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  return null;
}

/**
 * Find HQL location for specific syntax errors with known patterns
 */
function findSpecificSyntaxErrorLocation(error: Error, hqlFile: string): {line: number, column: number} | null {
  try {
    // Read the file content
    const fileContent = Deno.readTextFileSync(hqlFile);
    const lines = fileContent.split('\n');
    
    // Check for "let requires exactly X arguments" error
    const letArgsMatch = error.message.match(/let requires exactly (\d+) arguments/i);
    if (letArgsMatch) {
      // Search for let statements with incorrect number of arguments
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Look for (let ...) pattern
        if (line.includes('(let ')) {
          // Find the position of "let"
          const letPos = line.indexOf('let');
          if (letPos >= 0) {
            return {
              line: i + 1,
              column: letPos + 1 // Point to the "let" keyword
            };
          }
        }
      }
    }
    
    // Check for "Unexpected token" errors
    const tokenMatch = error.message.match(ERROR_REGEX.TOKEN);
    if (tokenMatch) {
      const unexpectedToken = tokenMatch[1];
      
      // Search for the unexpected token
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.includes(unexpectedToken)) {
          // Find the position of the unexpected token
          const tokenPos = line.indexOf(unexpectedToken);
          if (tokenPos >= 0) {
            return {
              line: i + 1,
              column: tokenPos + 1 // Point to the unexpected token
            };
          }
        }
      }
    }
    
    // Check for "Missing X" errors
    const missingMatch = error.message.match(/missing ([a-zA-Z0-9_\-]+)/i);
    if (missingMatch) {
      // Find a reasonable location based on keyword searches
      const keywords = ['import', 'let', 'fn', 'if', 'cond', 'when', 'loop'];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check for any of our keywords
        for (const keyword of keywords) {
          if (line.includes(`(${keyword} `)) {
            // Find the position of the keyword
            const keywordPos = line.indexOf(keyword);
            if (keywordPos >= 0) {
              return {
                line: i + 1,
                column: keywordPos + 1 // Point to the keyword
              };
            }
          }
        }
      }
    }
  } catch (e) {
    logger.debug(`Error finding specific syntax error location: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  return null;
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
    logger.debug(`Error reading context lines from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
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
  
  // Look in relevant directories for related HQL files
  try {
    if (errorLocation.file) {
      // First check the directory where the JS file is located
      const jsDir = path.dirname(errorLocation.file);
      try {
        for await (const entry of Deno.readDir(jsDir)) {
          if (entry.isFile && entry.name.endsWith(PATH_KEYS.HQL_EXTENSION)) {
            candidates.push({
              hqlFile: path.join(jsDir, entry.name),
              line: errorLocation.line,
              column: errorLocation.column
            });
          }
        }
      } catch (_e) {
        // Ignore errors reading the directory
      }
      
      // Also check one level up
      const parentDir = path.dirname(jsDir);
      try {
        for await (const entry of Deno.readDir(parentDir)) {
          if (entry.isFile && entry.name.endsWith(PATH_KEYS.HQL_EXTENSION)) {
            candidates.push({
              hqlFile: path.join(parentDir, entry.name),
              line: errorLocation.line,
              column: errorLocation.column
            });
          }
        }
      } catch (_e) {
        // Ignore errors reading the directory
      }
    }
  } catch (_e) {
    // Ignore errors in the directory search process
  }
  
  return candidates;
}

/**
 * Create a suggestion based on the error type and message
 */
function createSuggestionForError(error: Error): string | undefined {
  const errorMessage = error.message.toLowerCase();
  
  // Uncaught TypeError: Cannot read property/Cannot read properties of
  if (errorMessage.includes(ERROR_PATTERNS.CANNOT_READ) && 
      (errorMessage.includes(ERROR_PATTERNS.PROPERTY_OF) || errorMessage.includes(ERROR_PATTERNS.PROPERTIES_OF))) {
    return ERROR_SUGGESTIONS.NULL_PROPERTY;
  }
  
  // Uncaught ReferenceError: X is not defined
  if (errorMessage.includes(ERROR_PATTERNS.IS_NOT_DEFINED)) {
    const variableName = errorMessage.match(ERROR_REGEX.UNDEFINED_VAR)?.[1];
    if (variableName) {
      // Special case for "get"
      if (variableName === ERROR_PATTERNS.GET_FUNCTION) {
        return ERROR_SUGGESTIONS.GET_FUNCTION;
      }
      return ERROR_SUGGESTIONS.UNDEFINED_VAR(variableName);
    }
    return ERROR_SUGGESTIONS.DEFINE_VARS;
  }
  
  // TypeError: X is not a function
  if (errorMessage.includes(ERROR_PATTERNS.IS_NOT_FUNCTION)) {
    return ERROR_SUGGESTIONS.NOT_FUNCTION;
  }
  
  // Import errors
  if (errorMessage.includes(ERROR_PATTERNS.NOT_FOUND_IN_MODULE)) {
    return ERROR_SUGGESTIONS.IMPORT_SYMBOLS;
  }
  
  // Property doesn't exist
  if (errorMessage.includes(ERROR_PATTERNS.PROPERTY_OF) && errorMessage.includes(ERROR_PATTERNS.PROPERTY_NOT_FOUND)) {
    return ERROR_SUGGESTIONS.MISSING_PROPERTY;
  }
  
  // SyntaxError: Unexpected token
  if (errorMessage.includes(ERROR_PATTERNS.UNEXPECTED_TOKEN)) {
    return ERROR_SUGGESTIONS.SYNTAX_ERROR;
  }
  
  // Too many arguments
  if (errorMessage.includes(ERROR_PATTERNS.TOO_MANY_ARGUMENTS) && errorMessage.includes(ERROR_PATTERNS.ARGUMENTS)) {
    return ERROR_SUGGESTIONS.TOO_MANY_ARGS;
  }
  
  // Invalid form
  if (errorMessage.includes(ERROR_PATTERNS.INVALID) && errorMessage.includes(ERROR_PATTERNS.FORM)) {
    return ERROR_SUGGESTIONS.INVALID_FORM;
  }
  
  // Default suggestion
  return ERROR_SUGGESTIONS.DEFAULT;
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
      // Use our error location finding algorithm
      const possibleLocations = await findErrorLocation(error, runtimeContext.currentHqlFile);
      
      if (possibleLocations.length > 0) {
        // Use the most likely location (first in the list)
        hqlLocation = {
          hqlFile: runtimeContext.currentHqlFile,
          line: possibleLocations[0].line,
          column: possibleLocations[0].column
        };
        
        // If we have multiple possible locations, enhance the error message
        if (possibleLocations.length > 1) {
          const locationStrings = possibleLocations
            .map(loc => `line ${loc.line}, column ${loc.column}`)
            .join("; ");
          
          // Only modify the message if it doesn't already contain location info
          if (!error.message.includes("line") && !error.message.includes("column")) {
            error.message = `${error.message} (Likely error locations: ${locationStrings})`;
          }
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
    
    // Prevent double reporting: if already reported, skip
    if (Object.prototype.hasOwnProperty.call(error, reportedSymbol)) {
      return;
    }

    // Mark the original error as reported before any reporting
    Object.defineProperty(error, reportedSymbol, {
      value: true,
      enumerable: false
    });

    // If we found a location, create a RuntimeError with it
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
          originalError: error
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
      Object.defineProperty(hqlError, reportedSymbol, {
        value: true,
        enumerable: false
      });
      
      // Report the error with the enhanced HQL information
      await globalErrorReporter.reportError(hqlError, true);
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
 * Initialize the HQL runtime error handling system
 */
export function initializeErrorHandling(): void {
  installGlobalErrorHandler();
  logger.debug("HQL error handling system initialized");
}