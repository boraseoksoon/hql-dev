// src/repl/repl-ui.ts
// REPL UI rendering, formatting, and terminal utilities

import * as termColors from "../utils/colors.ts";

/**
 * Terminal color utility object with all available colors
 */
export const colors = {
  reset: termColors.reset,
  bright: termColors.bright,
  dim: termColors.dim,
  underscore: termColors.underscore,
  blink: termColors.blink,
  reverse: termColors.reverse,
  hidden: termColors.hidden,
  fg: termColors.fg,
  bg: termColors.bg
};

/**
 * Print a formatted block of text with a header
 */
export function printBlock(header: string, content: string, useColors = false): void {
  const headerText = useColors
    ? `${colors.fg.sicpRed}${colors.bright}${header}${colors.reset}`
    : header;
  console.log(headerText);
  console.log(content, "\n");
}

/**
 * Color text with the given color code if colors are enabled
 */
export function colorText(text: string, colorCode: string, useColors = true): string {
  return useColors ? `${colorCode}${text}${colors.reset}` : text;
}

/**
 * Print an error message in red if colors are enabled
 */
export function printError(msg: string, useColors: boolean): void {
  console.error(useColors ? `${colors.fg.red}${msg}${colors.reset}` : msg);
}

/**
 * Get the appropriate REPL prompt based on state
 */
export function getPrompt(state: {
  multilineMode: boolean;
  importHandlerActive: boolean;
  currentModule: string;
  bracketStack: string[];
}, useColors: boolean): string {
  if (state.importHandlerActive) {
    return useColors ? `${colors.fg.sicpRed}import>${colors.reset} ` : "import> ";
  }
  
  if (state.multilineMode) {
    // Make the continuation prompt have the same width as the main prompt
    // but reduce padding by 3 spaces to avoid pushing code too far right
    const moduleNameLength = state.currentModule.length;
    // Calculate padding needed to match width of hql[module]>
    const paddingLength = 4 + moduleNameLength + 2 - 3; // "hql[" + module + "]>" minus 3 spaces
    const padding = " ".repeat(paddingLength);
    return useColors ? `${colors.fg.gray}...${padding}${colors.reset} ` : `...${padding} `;
  }
  
  return useColors
    ? `${colors.fg.sicpBlue}hql${colors.reset}${colors.fg.sicpRed}[${state.currentModule}]${colors.reset}> `
    : `hql[${state.currentModule}]> `;
}

/**
 * Format a value for display with type-appropriate styling
 */
export function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  
  if (typeof value === 'function') {
    return value.toString().includes("native code")
      ? "[Native Function]"
      : "[Function]";
  }
  
  if (typeof value === 'object') {
    try {
      if (Array.isArray(value)) {
        if (value.length > 5) {
          return `[Array(${value.length}): ${JSON.stringify(value.slice(0, 5))}...]`;
        }
        return JSON.stringify(value);
      }
      
      const stringified = JSON.stringify(value, null, 2);
      if (stringified.length > 100) {
        return stringified.substring(0, 100) + "...";
      }
      return stringified;
    } catch (e) {
      return "[Object]";
    }
  }
  
  return String(value);
}

/**
 * Format source code for display with proper indentation
 */
export function formatSourceCode(source: string): string {
  // Replace escaped newlines with actual newlines
  let formattedSource = source;
  
  // If the source is a string with quotes and escaped newlines, clean it up
  if (source.includes('\\n')) {
    // Remove surrounding quotes if present
    if ((source.startsWith('"') && source.endsWith('"')) || 
        (source.startsWith("'") && source.endsWith("'"))) {
      formattedSource = source.slice(1, -1);
    }
    
    // Replace escaped newlines with actual newlines
    formattedSource = formattedSource.replace(/\\n/g, '\n');
    
    // Replace other common escape sequences
    formattedSource = formattedSource
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  }
  
  // Add proper indentation for improved readability
  const lines = formattedSource.split('\n');
  let indentLevel = 0;
  const indentedLines = lines.map(line => {
    // Decrease indent level for lines with closing parentheses
    const closingCount = (line.match(/\)/g) || []).length;
    // Increase indent level for lines with opening parentheses
    const openingCount = (line.match(/\(/g) || []).length;
    
    // Calculate indent for this line (based on previous line's state)
    const currentIndent = '  '.repeat(Math.max(0, indentLevel));
    
    // Update indent level for next line
    indentLevel += openingCount - closingCount;
    
    return currentIndent + line.trim();
  });
  
  return indentedLines.join('\n');
}

/**
 * Print the REPL welcome banner with commands and info
 */
export function printBanner(useColors = false): void {
    const headerColor = useColors ? colors.fg.sicpPurple + colors.bright : "";
    const textColor = useColors ? colors.fg.white : "";
    const commandColor = useColors ? colors.fg.sicpRed : "";
    const cliColor = useColors ? colors.fg.cyan : "";
    const noteColor = useColors ? colors.fg.lightGreen : "";
    const reset = useColors ? colors.reset : "";
    const banner = [
      `${headerColor}╔════════════════════════════════════════════════════════════╗${reset}`,
      `${headerColor}║                ${textColor}HQL S-Expression REPL${headerColor}                        ║${reset}`,
      `${headerColor}╠════════════════════════════════════════════════════════════╣${reset}`,
      `${headerColor}║  ${textColor}Type HQL expressions to evaluate them${headerColor}                      ║${reset}`,
      `${headerColor}║  ${noteColor}The prompt ${textColor}hql[module]>${noteColor} shows your current module${headerColor}               ║${reset}`,
      `${headerColor}║  ${noteColor}Use ${commandColor}Tab${noteColor} to complete, ${commandColor}Shift+Tab${noteColor} to cycle backwards${headerColor}            ║${reset}`,
      `${headerColor}║  ${textColor}commands:${headerColor}                                                  ║${reset}`,
      `${headerColor}║    ${commandColor}:help${textColor} - Display help (use ${commandColor}:help <command>${textColor} for details)     ║${reset}`,
      `${headerColor}║    ${commandColor}:quit${textColor}, ${commandColor}:exit${textColor} - Exit the REPL${headerColor}                             ║${reset}`,
      `${headerColor}║    ${commandColor}:env${textColor} - Show environment bindings${headerColor}                         ║${reset}`,
      `${headerColor}║    ${commandColor}:macros${textColor} - Show defined macros${headerColor}                            ║${reset}`,
      `${headerColor}║    ${commandColor}:go${textColor} - Switch to module or show current${headerColor}                   ║${reset}`,
      `${headerColor}║    ${commandColor}:modules${textColor} - List all available modules${headerColor}                    ║${reset}`,
      `${headerColor}║    ${commandColor}:list${textColor} - Show symbols in current module${headerColor}                   ║${reset}`,
      `${headerColor}║    ${commandColor}:find${textColor} - Search for symbols and modules${headerColor}                   ║${reset}`,
      `${headerColor}║    ${commandColor}:see${textColor} - Inspect modules and symbols${headerColor}                       ║${reset}`,
      `${headerColor}║    ${commandColor}:doc${textColor} - Show documentation for a symbol or module${headerColor}         ║${reset}`,
      `${headerColor}║    ${commandColor}:remove${textColor} - Remove a symbol or module${headerColor}                      ║${reset}`,
      `${headerColor}║  ${textColor}cli:${headerColor}                                                       ║${reset}`,
      `${headerColor}║    ${cliColor}ls${textColor} - List symbols in current module${headerColor}                        ║${reset}`,
      `${headerColor}║    ${cliColor}cd <module>${textColor} - Switch to a different module${headerColor}                 ║${reset}`,
      `${headerColor}║    ${cliColor}pwd${textColor} - Show current module${headerColor}                                  ║${reset}`,
      `${headerColor}║    ${cliColor}find <term>${textColor} - Search for symbols and modules${headerColor}               ║${reset}`,
      `${headerColor}║    ${cliColor}mkdir <module>${textColor} - Create a new module${headerColor}                       ║${reset}`,
      `${headerColor}║    ${cliColor}man <command>${textColor} - Show help for a command${headerColor}                    ║${reset}`,
      `${headerColor}║    ${cliColor}rm <target>${textColor} - Remove symbols or modules${headerColor}                    ║${reset}`,
      `${headerColor}╚════════════════════════════════════════════════════════════╝${reset}`
    ];
    banner.forEach(line => console.log(line));
}

/**
 * Pretty-print the result with proper formatting and syntax highlighting
 */
export function prettyPrintResult(result: any, useColors: boolean, verbose: boolean = false): void {
  // Check for evaluation result objects with a "value" property (from the evaluator)
  if (result !== null && typeof result === 'object' && 'value' in result && !verbose) {
    // Simplified output - just show the value
    const value = result.value;
    
    // Handle undefined/null returned from function definitions
    if (value === undefined || value === null) {
      console.log(useColors ? `${colors.fg.gray}${String(value)}${colors.reset}` : String(value));
      return;
    }
    
    // For other values, pretty print just the value
    prettyPrintValue(value, useColors);
    return;
  }
  
  if (result === undefined || result === null) {
    console.log(useColors ? `${colors.fg.gray}${String(result)}${colors.reset}` : String(result));
    return;
  }
  
  // Safety check - for objects that might have custom toString/valueOf methods
  try {
    // Handle arrays - fix for nested arrays
    if (Array.isArray(result)) {
      // Use console.log as a fallback if prettyPrintArray fails
      try {
        prettyPrintArray(result, useColors, 0);
      } catch (error) {
        // Fallback to standard console.log if pretty printing fails
        console.log(result);
      }
      return;
    }
    
    const numberColor = useColors ? colors.fg.yellow : "";
    const stringColor = useColors ? colors.fg.green : "";
    const keywordColor = useColors ? colors.fg.sicpRed : "";
    const symbolColor = useColors ? colors.fg.sicpBlue : "";
    const bracketColor = useColors ? colors.fg.gray : "";
    const boolColor = useColors ? colors.fg.magenta : "";
    const reset = useColors ? colors.reset : "";
    
    // Handle different types of values 
    if (typeof result === 'number') {
      console.log(`${numberColor}${result}${reset}`);
    } 
    else if (typeof result === 'string') {
      // Check if it's a string value (with quotes) or a symbol
      if (result.startsWith('"') && result.endsWith('"')) {
        console.log(`${stringColor}${result}${reset}`);
      } else {
        console.log(`${symbolColor}${result}${reset}`);
      }
    } 
    else if (typeof result === 'boolean') {
      console.log(`${boolColor}${result}${reset}`);
    }
    else if (result instanceof Map) {
      try {
        prettyPrintMap(result, useColors, 0);
      } catch (error) {
        // Fallback to standard JSON representation
        console.log(Object.fromEntries(result));
      }
    }
    else if (typeof result === 'object') {
      try {
        prettyPrintObject(result, useColors, 0);
      } catch (error) {
        // Fallback to standard console.log
        console.log(result);
      }
    }
    else {
      // Default fallback for any other types
      console.log(String(result));
    }
  } catch (error) {
    // Final fallback for any unexpected errors
    console.log(`Error displaying result: ${String(result)}`);
  }
}

/**
 * Pretty-print an array with indentation, with additional error handling
 */
function prettyPrintArray(arr: any[], useColors: boolean, indent: number): void {
  const numberColor = useColors ? colors.fg.yellow : "";
  const stringColor = useColors ? colors.fg.green : "";
  const bracketColor = useColors ? colors.fg.gray : "";
  const commaColor = useColors ? colors.fg.gray : "";
  const reset = useColors ? colors.reset : "";
  
  if (!arr || !Array.isArray(arr)) {
    // Safety check - if not actually an array, fall back to console.log
    console.log(arr);
    return;
  }
  
  if (arr.length === 0) {
    console.log(`${bracketColor}[]${reset}`);
    return;
  }
  
  // For short arrays with simple values, print on a single line
  if (arr.length <= 5 && arr.every(item => 
    typeof item !== 'object' || item === null || 
    (Array.isArray(item) && item.length === 0))) {
    try {
      const items = arr.map(item => {
        if (typeof item === 'number') return `${numberColor}${item}${reset}`;
        if (typeof item === 'string') return `${stringColor}"${item}"${reset}`;
        if (item === null) return "null";
        if (Array.isArray(item)) return `${bracketColor}[]${reset}`;
        return String(item);
      });
      
      console.log(`${bracketColor}[${reset}${items.join(`${commaColor}, ${reset}`)}${bracketColor}]${reset}`);
      return;
    } catch (error) {
      // If we can't pretty print the simple array, fall back to basic formatting
      console.log(arr);
      return;
    }
  }
  
  // For more complex arrays, print with indentation
  const indentStr = ' '.repeat(indent);
  const innerIndentStr = ' '.repeat(indent + 2);
  
  try {
    console.log(`${bracketColor}[${reset}`);
    
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      try {
        process.stdout.write(innerIndentStr);
        
        if (Array.isArray(item)) {
          prettyPrintArray(item, useColors, indent + 2);
        } 
        else if (item instanceof Map) {
          prettyPrintMap(item, useColors, indent + 2);
        }
        else if (item !== null && typeof item === 'object') {
          prettyPrintObject(item, useColors, indent + 2);
        }
        else if (typeof item === 'number') {
          process.stdout.write(`${numberColor}${item}${reset}`);
        }
        else if (typeof item === 'string') {
          if (item.startsWith('"') && item.endsWith('"')) {
            process.stdout.write(`${stringColor}${item}${reset}`);
          } else {
            process.stdout.write(`${stringColor}"${item}"${reset}`);
          }
        }
        else {
          process.stdout.write(String(item || 'null'));
        }
        
        if (i < arr.length - 1) {
          console.log(',');
        } else {
          console.log();
        }
      } catch (itemError) {
        // If an individual item fails, print it plainly and continue
        console.log(`${String(item)},`);
      }
    }
    
    console.log(`${indentStr}${bracketColor}]${reset}`);
  } catch (error) {
    // If the complex formatting fails, fall back to standard output
    console.log(`${indentStr}${JSON.stringify(arr, null, 2)}`);
  }
}

/**
 * Pretty-print a Map object with indentation
 */
function prettyPrintMap(map: Map<any, any>, useColors: boolean, indent: number): void {
  const bracketColor = useColors ? colors.fg.gray : "";
  const keyColor = useColors ? colors.fg.sicpRed : "";
  const reset = useColors ? colors.reset : "";
  
  if (map.size === 0) {
    console.log(`${bracketColor}{}${reset}`);
    return;
  }
  
  const indentStr = ' '.repeat(indent);
  const innerIndentStr = ' '.repeat(indent + 2);
  
  console.log(`${bracketColor}{${reset}`);
  
  let i = 0;
  for (const [key, value] of map.entries()) {
    process.stdout.write(`${innerIndentStr}${keyColor}${key}${reset}: `);
    
    if (Array.isArray(value)) {
      prettyPrintArray(value, useColors, indent + 2);
    } 
    else if (value instanceof Map) {
      prettyPrintMap(value, useColors, indent + 2);
    }
    else if (value !== null && typeof value === 'object') {
      prettyPrintObject(value, useColors, indent + 2);
    }
    else {
      prettyPrintValue(value, useColors);
    }
    
    if (i < map.size - 1) {
      console.log(',');
    } else {
      console.log();
    }
    i++;
  }
  
  console.log(`${indentStr}${bracketColor}}${reset}`);
}

/**
 * Pretty-print an object with indentation and error handling
 */
function prettyPrintObject(obj: object, useColors: boolean, indent: number): void {
  const bracketColor = useColors ? colors.fg.gray : "";
  const keyColor = useColors ? colors.fg.sicpRed : "";
  const reset = useColors ? colors.reset : "";
  
  if (!obj || typeof obj !== 'object') {
    // Safety check
    console.log(obj);
    return;
  }
  
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    console.log(`${bracketColor}{}${reset}`);
    return;
  }
  
  const indentStr = ' '.repeat(indent);
  const innerIndentStr = ' '.repeat(indent + 2);
  
  try {
    console.log(`${bracketColor}{${reset}`);
    
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      try {
        // Skip internal metadata properties unless we're at the top level
        if (key === '_metadata' && indent > 0) {
          continue;
        }
        
        const value = (obj as any)[key];
        
        process.stdout.write(`${innerIndentStr}${keyColor}${key}${reset}: `);
        
        if (Array.isArray(value)) {
          prettyPrintArray(value, useColors, indent + 2);
        } 
        else if (value instanceof Map) {
          prettyPrintMap(value, useColors, indent + 2);
        }
        else if (value !== null && typeof value === 'object') {
          prettyPrintObject(value, useColors, indent + 2);
        }
        else {
          prettyPrintValue(value, useColors);
        }
        
        if (i < keys.length - 1) {
          console.log(',');
        } else {
          console.log();
        }
      } catch (itemError) {
        // If an individual property fails, print it plainly and continue
        const value = (obj as any)[key];
        const valueStr = typeof value === 'object' ? '[Object]' : String(value || 'null');
        console.log(`${innerIndentStr}${key}: ${valueStr},`);
      }
    }
    
    console.log(`${indentStr}${bracketColor}}${reset}`);
  } catch (error) {
    // Fall back to standard output if pretty printing fails
    try {
      console.log(`${indentStr}${JSON.stringify(obj, null, 2)}`);
    } catch {
      // Last resort fallback
      console.log(obj);
    }
  }
}

/**
 * Helper function to print just a value (used for simplified output)
 */
function prettyPrintValue(value: any, useColors: boolean): void {
  const numberColor = useColors ? colors.fg.yellow : "";
  const stringColor = useColors ? colors.fg.green : "";
  const symbolColor = useColors ? colors.fg.sicpBlue : "";
  const boolColor = useColors ? colors.fg.magenta : "";
  const reset = useColors ? colors.reset : "";
  
  if (value === undefined || value === null) {
    console.log(useColors ? `${colors.fg.gray}${String(value)}${colors.reset}` : String(value));
    return;
  }
  
  // Handle different types directly
  if (Array.isArray(value)) {
    try {
      prettyPrintArray(value, useColors, 0);
    } catch (error) {
      console.log(value);
    }
  }
  else if (typeof value === 'number') {
    console.log(`${numberColor}${value}${reset}`);
  } 
  else if (typeof value === 'string') {
    if (value.startsWith('"') && value.endsWith('"')) {
      console.log(`${stringColor}${value}${reset}`);
    } else {
      console.log(`${symbolColor}${value}${reset}`);
    }
  } 
  else if (typeof value === 'boolean') {
    console.log(`${boolColor}${value}${reset}`);
  }
  else if (value instanceof Map) {
    try {
      prettyPrintMap(value, useColors, 0);
    } catch (error) {
      console.log(Object.fromEntries(value));
    }
  }
  else if (typeof value === 'object') {
    try {
      prettyPrintObject(value, useColors, 0);
    } catch (error) {
      console.log(value);
    }
  }
  else {
    console.log(String(value));
  }
}