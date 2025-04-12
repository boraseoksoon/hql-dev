// src/repl/repl-commands.ts
// Command handlers for REPL commands

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { ReplState } from "./repl-state.ts";
import { 
  colorText, 
  printError, 
  formatValue, 
  confirmAction, 
  moduleUtils 
} from "./repl-common.ts";
import { toInternalName, toUserFacingName } from "./repl-completion.ts";
import { getDetailedHelp } from "./repl-help.ts";
import * as colors from "@core/utils/colors.ts";

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
    `${headerColor}║  ${textColor}commands:${headerColor}                                                  ║${reset}`,
    `${headerColor}║    ${commandColor}:help${textColor} - Display help (use ${commandColor}:help <command>${textColor} for details)     ║${reset}`,
    `${headerColor}║    ${commandColor}:quit${textColor}, ${commandColor}:exit${textColor} - Exit the REPL${headerColor}                             ║${reset}`,
    `${headerColor}║    ${commandColor}:env${textColor} - Show environment bindings${headerColor}                         ║${reset}`,
    `${headerColor}║    ${commandColor}:macros${textColor} - Show defined macros${headerColor}                            ║${reset}`,
    `${headerColor}║    ${commandColor}:go${textColor} - Switch to module or show current${headerColor}                   ║${reset}`,
    `${headerColor}║    ${commandColor}:modules${textColor} - List all available modules${headerColor}                    ║${reset}`,
    `${headerColor}║    ${commandColor}:list${textColor} - Show symbols in current module${headerColor}                   ║${reset}`,
    `${headerColor}║    ${commandColor}:find${textColor} - Search for symbols and modules${headerColor}                   ║${reset}`,
    `${headerColor}║    ${commandColor}:show${textColor} - Inspect modules and symbols details${headerColor}              ║${reset}`,
    `${headerColor}║    ${commandColor}:doc${textColor} - Show documentation for a symbol or module${headerColor}         ║${reset}`,
    `${headerColor}║    ${commandColor}:remove${textColor} - Remove a symbol or module${headerColor}                      ║${reset}`,
    `${headerColor}║    ${commandColor}:clear${textColor} - Clear the screen${headerColor}                                ║${reset}`,
    `${headerColor}║  ${textColor}cli:${headerColor}                                                       ║${reset}`,
    `${headerColor}║    ${cliColor}ls${textColor} - List symbols in current module${headerColor}                        ║${reset}`,
    `${headerColor}║    ${cliColor}cd <module>${textColor} - Switch to a different module${headerColor}                 ║${reset}`,
    `${headerColor}║    ${cliColor}pwd${textColor} - Show current module${headerColor}                                  ║${reset}`,
    `${headerColor}║    ${cliColor}find <term>${textColor} - Search for symbols and modules${headerColor}               ║${reset}`,
    `${headerColor}║    ${cliColor}mkdir <module>${textColor} - Create a new module${headerColor}                       ║${reset}`,
    `${headerColor}║    ${cliColor}man <command>${textColor} - Show help for a command${headerColor}                    ║${reset}`,
    `${headerColor}║    ${cliColor}rm <target>${textColor} - Remove symbols or modules${headerColor}                    ║${reset}`,
    `${headerColor}║    ${cliColor}clear${textColor} - Clear the screen${headerColor}                                   ║${reset}`,
    `${headerColor}║  ${textColor}tips:${headerColor}                                                      ║${reset}`,
    `${headerColor}║    ${noteColor}Tab${textColor} - Auto-complete commands, symbols, modules${headerColor}             ║${reset}`,
    `${headerColor}║    ${noteColor}Shift+Tab${textColor} - Cycle backward through completions${headerColor}             ║${reset}`,
    `${headerColor}╚════════════════════════════════════════════════════════════╝${reset}`
  ];
  banner.forEach(line => console.log(line));
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
 * Pretty-print an array with indentation
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
 * Pretty-print an object with indentation
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

/**
 * Print CLI help for commands
 */
export function printCliHelp(useColors: boolean): void {
  const titleColor = useColors ? "\x1b[36;1m" : "";
  const commandColor = useColors ? "\x1b[33;1m" : "";
  const descColor = useColors ? "\x1b[37m" : "";
  const reset = useColors ? "\x1b[0m" : "";
  
  console.log(`${titleColor}CLI-Style Commands${reset}`);
  console.log(`${titleColor}=================\n${reset}`);
  console.log(`The HQL REPL supports Unix-like CLI commands for common operations:\n`);
  
  const commands = [
    ["ls", "List symbols in current module"],
    ["ls -m, ls -modules", "List all available modules"],
    ["ls -all", "List all symbols across all modules"],
    ["pwd", "Show current module name"],
    ["cd <module>", "Switch to a different module"],
    ["mkdir <module>", "Create a new module"],
    ["find <term>", "Search for symbols and modules"],
    ["man [command]", "Show help documentation"],
    ["rm <symbol>", "Remove a symbol from current module"],
    ["rm <module>", "Remove an entire module"],
    ["rm <module>:<symbol>", "Remove a symbol from a specific module"],
    ["rm -f <target>", "Force remove without confirmation"],
    ["rm -rf <target>", "Force remove recursively without confirmation"],
    ["rm *", "Remove all symbols in current module"],
    ["rm /", "Remove everything (all modules and symbols)"],
    ["clear, cls", "Clear the terminal screen"]
  ];
  
  commands.forEach(([cmd, desc]) => {
    console.log(`  ${commandColor}${cmd}${reset} - ${descColor}${desc}${reset}`);
  });
  
  console.log(`\n${titleColor}Examples:${reset}`);
  console.log(`  ${commandColor}ls${reset}                    # List symbols in current module`);
  console.log(`  ${commandColor}cd math${reset}               # Switch to 'math' module`);
  console.log(`  ${commandColor}mkdir geometry${reset}        # Create a new 'geometry' module`);
  console.log(`  ${commandColor}find matrix${reset}           # Search for symbols containing 'matrix'`);
  console.log(`  ${commandColor}man find${reset}              # Show help for the 'find' command`);
  console.log(`  ${commandColor}rm factorial${reset}          # Remove symbol 'factorial' from current module`);
  console.log(`  ${commandColor}rm math:sqrt${reset}          # Remove 'sqrt' symbol from 'math' module`);
  console.log(`  ${commandColor}rm -f math${reset}            # Force remove 'math' module without confirmation`);
  console.log(`  ${commandColor}rm *${reset}                  # Remove all symbols in current module`);
  
  console.log(`\n${titleColor}Equivalent REPL Commands:${reset}`);
  console.log(`  ${commandColor}ls${reset} = ${commandColor}:list${reset}`);
  console.log(`  ${commandColor}cd${reset} = ${commandColor}:go${reset}`);
  console.log(`  ${commandColor}find${reset} = ${commandColor}:find${reset}`);
  console.log(`  ${commandColor}man${reset} = ${commandColor}:help${reset}`);
  console.log(`  ${commandColor}rm${reset} = ${commandColor}:remove${reset}`);
}

/**
 * Shared implementation for help commands
 */
export function showCommandHelp(command: string, useColors: boolean): void {
  if (!command || command.trim() === "") {
    // No arguments, just show the banner
    printBanner(useColors);
    console.log("\nTip: Use :help <command> to see detailed help and options for specific commands");
    console.log("     For example: :help ls - shows all available options for the ls command");
  } else {
    // Show detailed help for a specific command
    // Remove any leading colon to support both `:help command` and `:help :command` formats
    let commandName = command.trim().toLowerCase();
    if (commandName.startsWith(':')) {
      commandName = commandName.substring(1);
    }
    
    // Special handling for 'cli' to show CLI command help
    if (commandName === 'cli') {
      printCliHelp(useColors);
      return;
    }
    
    console.log(`Showing help for command: ${commandName}`);
    const helpText = getDetailedHelp(commandName, useColors);
    console.log(helpText);
  }
}

/**
 * Handle the :help command
 */
export function commandHelp(args: string, useColors: boolean): void {
  showCommandHelp(args, useColors);
}

/**
 * Handle the :cli command to show available CLI commands
 */
export function commandCli(useColors: boolean): void {
  printCliHelp(useColors);
}

/**
 * Handle the :quit command
 */
export function commandQuit(setRunning: (val: boolean) => void): void {
  console.log("Exiting REPL...");
  
  // Force save state before exit
  try {
    const { persistentStateManager } = require("./persistent-state-manager.ts");
    persistentStateManager.forceSync();
  } catch (e) {
    // Ignore if persistent state manager is not available
  }
  
  setRunning(false);
}

/**
 * Handle the :env command
 */
export function commandEnv(evaluator: ModuleAwareEvaluator, useColors: boolean, logger: { isVerbose: boolean }): void {
  const env = evaluator.getEnvironment();
  console.log(colorText("Environment bindings:", useColors ? "\x1b[31;1m" : "", useColors));
  
  // Get all defined symbols
  const symbols = env.getAllDefinedSymbols();
  
  if (symbols.length === 0) {
    console.log("No symbols defined");
  } else {
    console.log("Defined symbols:");
    console.log("----------------");
    symbols.forEach(symbol => {
      try {
        // Skip internal symbols and properties of objects
        if (symbol.includes('.')) return;
        
        const value = env.lookup(symbol);
        const valueStr = formatValue(value);
        console.log(`${symbol} = ${valueStr}`);
      } catch (error: unknown) {
        // Don't display lookup errors - these are usually for properties
        if (logger.isVerbose) {
          printError(
            `Error looking up ${symbol}: ${CommonErrorUtils.formatErrorMessage(error)}`,
            useColors
          );
        }
      }
    });
    console.log("----------------");
  }
}

/**
 * Handle the :macros command
 */
export function commandMacros(evaluator: ModuleAwareEvaluator, useColors: boolean): void {
  console.log(colorText("Defined macros:", useColors ? "\x1b[31;1m" : "", useColors));
  const environment = evaluator.getEnvironment();
  console.log("Macro names:");
  console.log("------------");
  if (environment && "macros" in environment && (environment as any).macros instanceof Map) {
    const macroKeys = Array.from((environment as any).macros.keys());
    if (macroKeys.length > 0) {
      macroKeys.sort().forEach(macroName => {
        console.log(`- ${macroName}`);
      });
    } else {
      console.log("No macros defined");
    }
  } else {
    console.log("Macro information not available");
  }
  console.log("------------");
}

/**
 * Handle the :modules command
 */
export async function commandModules(evaluator: ModuleAwareEvaluator, useColors: boolean): Promise<void> {
  console.log(colorText("Available modules:", useColors ? "\x1b[31;1m" : "", useColors));
  
  const modules = await evaluator.getAvailableModules();
  
  if (modules.length === 0) {
    console.log("No modules defined");
  } else {
    // Separate modules into core and user modules
    const coreModules = ['global', 'user'];
    const userModules = modules.filter(m => !coreModules.includes(m));
    
    console.log("Core System Modules (protected):");
    console.log("--------------------------");
    coreModules.forEach(moduleName => {
      if (modules.includes(moduleName)) {
        const isCurrent = moduleName === evaluator.getCurrentModuleSync();
        const displayName = isCurrent 
          ? colorText(moduleName, useColors ? "\x1b[32;1m" : "", useColors) + " (current)"
          : moduleName;
        
        // Add special marker for global module
        const description = moduleName === 'global' 
          ? " - Core system module with essential functionality"
          : " - Protected system module";
          
        console.log(`- ${displayName}${colorText(description, useColors ? "\x1b[36m" : "", useColors)}`);
      }
    });
    
    if (userModules.length > 0) {
      console.log("\nUser Modules:");
      console.log("-----------");
      userModules.sort().forEach(moduleName => {
        const isCurrent = moduleName === evaluator.getCurrentModuleSync();
        const displayName = isCurrent 
          ? colorText(moduleName, useColors ? "\x1b[32;1m" : "", useColors) + " (current)"
          : moduleName;
        console.log(`- ${displayName}`);
      });
    }
    
    console.log("-----------");
    console.log("Tip: Use :go <module> to switch modules");
    console.log("     Use :show <module> to view module contents");
  }
}

/**
 * Handle the :go command (replaces :module)
 */
export async function commandGo(evaluator: ModuleAwareEvaluator, state: ReplState, moduleName: string, useColors: boolean = true): Promise<void> {
  // Check if module name is provided
  if (!moduleName) {
    // If no module name is provided, show the current module and display available modules
    const currentModule = evaluator.getCurrentModuleSync();
    
    console.log(colorText(`Current module: ${currentModule}`, 
                         useColors ? "\x1b[35;1m" : "", useColors));
    
    // Add special description for global module
    if (currentModule === 'global') {
      console.log(colorText("The 'global' module is a protected core system module that contains essential functionality.", 
                         useColors ? "\x1b[36m" : "", useColors));
    }
    
    console.log(`The module name appears in your prompt: hql[${currentModule}]>`);
    
    // Show available modules to help users
    console.log("\nAvailable modules:");
    try {
      await moduleUtils.showAvailableModules(evaluator, currentModule, useColors);
      console.log(`\nUse :go <module-name> to switch to a different module`);
    } catch (error) {
      // Silently handle errors getting modules list
    }
    return;
  }
  
  try {
    // Check if the module exists first
    const availableModules = await evaluator.getAvailableModules();
    
    // Special case for ".." - reject it as it causes confusion
    if (moduleName === "..") {
      console.error(`Module name '..' is not allowed as it can cause confusion.`);
      console.log(`Please choose a different module name.`);
      return;
    }
    
    if (!availableModules.includes(moduleName)) {
      console.error(`Module '${moduleName}' does not exist.`);
      
      // Show available modules
      await moduleUtils.showAvailableModules(evaluator, evaluator.getCurrentModuleSync(), useColors);
      
      console.log(`\nTo create a new module, use the 'mkdir ${moduleName}' command.`);
      return;
    }
    
    // Switch to the specified module
    await evaluator.switchModule(moduleName);
    // Update REPL state
    state.currentModule = evaluator.getCurrentModuleSync();
    console.log(`Switched to module: ${moduleName}`);
    
    // Add special message when switching to global module
    if (moduleName === 'global') {
      console.log(colorText("Note: The 'global' module is a protected core system module that contains essential functionality.", 
                     useColors ? "\x1b[36m" : "", useColors));
    }
  } catch (error: unknown) {
    const errorMessage = CommonErrorUtils.formatErrorMessage(error);
    console.error(`Error switching to module: ${errorMessage}`);
  }
}

/**
 * Handle the :list command and ls CLI command
 */
export async function commandList(evaluator: ModuleAwareEvaluator, useColors: boolean): Promise<void> {
  console.log(colorText("Symbols in current module:", useColors ? "\x1b[34;1m" : "", useColors));
  
  // Get list of symbols from current module
  const symbols = await evaluator.listModuleSymbols();
  
  if (symbols.length === 0) {
    console.log("No symbols defined");
  } else {
    console.log("Symbol names:");
    console.log("------------");
    for (const symbol of symbols.sort()) {
      console.log(`- ${symbol}`);
    }
    console.log("------------");
    console.log(`To see details about a symbol: ${colorText(":show <symbol-name>", useColors ? "\x1b[32m" : "", useColors)}`);
  }
}

/**
 * Handle the :find command
 */
export async function commandFind(evaluator: ModuleAwareEvaluator, args: string, useColors: boolean): Promise<void> {
  if (!args || args.trim() === "") {
    console.log("Usage: :find <search-term>");
    console.log("Searches for symbols and modules containing the search term");
    return;
  }
  
  const searchTerm = args.trim().toLowerCase();
  
  // Track all matches for reporting
  const matchingSymbols: Record<string, string[]> = {};
  const matchingModules: string[] = [];
  
  // Get all available modules
  const modules = await evaluator.getAvailableModules();
  
  // Check for module name matches
  for (const moduleName of modules) {
    if (moduleName.toLowerCase().includes(searchTerm)) {
      matchingModules.push(moduleName);
    }
    
    // Check for symbol matches within each module
    const moduleSymbols = await evaluator.listModuleSymbols(moduleName);
    const matchingModuleSymbols = moduleSymbols.filter(symbol => 
      symbol.toLowerCase().includes(searchTerm)
    );
    
    if (matchingModuleSymbols.length > 0) {
      matchingSymbols[moduleName] = matchingModuleSymbols;
    }
  }
  
  // Format and display results
  console.log(colorText("Search results for: ", useColors ? "\x1b[35;1m" : "", useColors) + 
    colorText(`"${searchTerm}"`, useColors ? "\x1b[33m" : "", useColors));
  
  if (matchingModules.length === 0 && Object.keys(matchingSymbols).length === 0) {
    console.log("No matches found");
    return;
  }
  
  if (matchingModules.length > 0) {
    console.log(colorText("\nMatching modules:", useColors ? "\x1b[34;1m" : "", useColors));
    console.log("----------------");
    for (const moduleName of matchingModules.sort()) {
      const isCurrent = moduleName === evaluator.getCurrentModuleSync();
      const displayName = isCurrent 
        ? colorText(moduleName, useColors ? "\x1b[32;1m" : "", useColors) + " (current)"
        : moduleName;
      console.log(`- ${displayName}`);
    }
  }
  
  if (Object.keys(matchingSymbols).length > 0) {
    console.log(colorText("\nMatching symbols:", useColors ? "\x1b[34;1m" : "", useColors));
    console.log("----------------");
    
    // Sort modules for consistent output
    const sortedModules = Object.keys(matchingSymbols).sort();
    
    for (const moduleName of sortedModules) {
      const symbols = matchingSymbols[moduleName].sort();
      const isCurrent = moduleName === evaluator.getCurrentModuleSync();
      const moduleDisplay = isCurrent 
        ? colorText(moduleName, useColors ? "\x1b[32;1m" : "", useColors) + " (current)"
        : moduleName;
      
      console.log(`\nIn module ${moduleDisplay}:`);
      
      for (const symbol of symbols) {
        console.log(`- ${symbol}`);
      }
    }
  }
  
  console.log("\nTip: Use `:show <module>:<symbol>` to view symbol details");
  console.log("    Use `:go <module>` to switch to a module");
}

/**
 * Handle the :remove command
 */
export async function commandRemove(
  evaluator: ModuleAwareEvaluator,
  args: string,
  useColors: boolean,
  replState: ReplState,
  isForceRemove: boolean = false
): Promise<void> {
  if (!args) {
    // Show helpful message when no arguments provided
    console.log("Usage:");
    console.log("  rm <symbol>        - Remove a symbol from current module");
    console.log("  rm <module>        - Remove an entire module");
    console.log("  rm <module>:<symbol> - Remove a symbol from a specific module");
    console.log("  rm -f ...          - Force remove without confirmation");
    console.log("  rm -rf ...         - Force remove recursively without confirmation");
    console.log("  rm *               - Remove all symbols in current module");
    console.log("  rm /               - Remove everything (all modules, symbols, and sync state)");
    console.log("  rm -history        - Clear command history");
    console.log("Note: The 'global' module is protected and cannot be removed");
    return;
  }

  // Parse flags and arguments
  const parts = args.split(/\s+/);
  let force = isForceRemove;
  let recursive = false;
  let target = args;

  // Check for -rf or -fr flags
  if (parts[0] === '-rf' || parts[0] === '-fr') {
    force = true;
    recursive = true;
    target = parts.slice(1).join(' ');
  } else if (parts[0] === '-f') {
    force = true;
    target = parts.slice(1).join(' ');
  }

  // Handle special paths
  if (target === '/' || target === '*') {
    if (!force) {
      const confirmed = await confirmAction(`Are you sure you want to remove ${target === '/' ? 'EVERYTHING including sync state' : 'all symbols in current module'}?`);
      if (!confirmed) {
        console.log('Operation cancelled.');
        return;
      }
    }

    if (target === '/') {
      // Remove everything - all modules except global and also state.json files
      const availableModules = await evaluator.getAvailableModules();
      let removedCount = 0;
      const protectedModules = ['global', 'user'];
      
      for (const module of availableModules) {
        if (!protectedModules.includes(module)) { // Don't remove protected modules
          if (await evaluator.removeModule(module)) {
            removedCount++;
          }
        }
      }
      
      // Also remove all symbols from the global module
      let removedSymbols = 0;
      const globalSymbols = await evaluator.listModuleSymbols('global');
      for (const symbol of globalSymbols) {
        if (evaluator.removeSymbol(symbol)) {
          removedSymbols++;
        }
      }

      // Reset state files by calling resetAllModules/forceSync
      try {
        // Import the persistentStateManager to directly access it
        const { persistentStateManager } = await import("./persistent-state-manager.ts");
        
        // Reset all modules but don't keep any modules
        persistentStateManager.resetAllModules(false);
        console.log("Removed and reinitialized all state files.");
        
        // Force sync to save the empty state
        persistentStateManager.forceSync();
      } catch (error) {
        console.error(`Error resetting state files: ${CommonErrorUtils.formatErrorMessage(error)}`);
      }
      
      if (removedCount > 0 || removedSymbols > 0) {
        if (removedCount > 0) {
          console.log(`Removed ${removedCount} modules.`);
        }
        if (removedSymbols > 0) {
          console.log(`Removed ${removedSymbols} symbols from the global module.`);
        }
        console.log(`Note: The 'global' module itself was preserved as it's a protected core module.`);
        
        // Set current module back to global/user to avoid being in a removed module
        if (!protectedModules.includes(replState.currentModule)) {
          await evaluator.switchModule('global');
          replState.currentModule = 'global';
        }
      } else {
        console.log('No modules or symbols to remove.');
      }
    } else {
      // Remove all symbols in current module
      if (replState.currentModule === 'global') {
        console.log(`Warning: Removing symbols from the 'global' module is discouraged.`);
        console.log(`This module contains core functionality for the system.`);
        
        if (!force) {
          const confirmGlobal = await confirmAction(`Do you still want to proceed with removing all symbols from 'global'?`);
          if (!confirmGlobal) {
            console.log('Operation cancelled.');
            return;
          }
        }
      }
      
      const symbols = await evaluator.listModuleSymbols();
      let removedCount = 0;
      
      for (const symbol of symbols) {
        if (evaluator.removeSymbol(symbol)) {
          removedCount++;
        }
      }

      // For '*', also force sync the current module's state
      try {
        // Import the persistentStateManager to directly access it
        const { persistentStateManager } = await import("./persistent-state-manager.ts");
        
        // Force sync to save the empty module state
        persistentStateManager.forceSync();
        console.log("Module state has been saved.");
      } catch (error) {
        console.error(`Error syncing state: ${CommonErrorUtils.formatErrorMessage(error)}`);
      }
      
      if (removedCount > 0) {
        console.log(`Removed ${removedCount} symbols from current module.`);
      } else {
        console.log('No symbols to remove in current module.');
      }
    }
    return;
  }

  // Handle module:symbol format
  if (target.includes(':')) {
    const [moduleName, symbolName] = target.split(':');
    if (!moduleName || !symbolName) {
      console.error('Invalid format. Use module:symbol');
      return;
    }

    // Check if module exists first
    const availableModules = await evaluator.getAvailableModules();
    if (!availableModules.includes(moduleName)) {
      console.error(`Module '${moduleName}' does not exist.`);
      console.log("Use :modules or ls -m to see available modules.");
      return;
    }

    // Warn if trying to modify global module
    if (moduleName === 'global' && !force) {
      console.log(`Warning: Removing symbols from the 'global' module is discouraged.`);
      console.log(`This module contains core functionality for the system.`);
      const confirmGlobal = await confirmAction(`Do you still want to proceed with removing '${symbolName}' from 'global'?`);
      if (!confirmGlobal) {
        console.log('Operation cancelled.');
        return;
      }
    }

    // Check if symbol exists in the module
    const moduleSymbols = await evaluator.listModuleSymbols(moduleName);
    if (!moduleSymbols.includes(symbolName)) {
      console.error(`Symbol '${symbolName}' does not exist in module '${moduleName}'.`);
      console.log(`Available symbols in module '${moduleName}':`);
      if (moduleSymbols.length > 0) {
        moduleSymbols.forEach(symbol => console.log(`  ${symbol}`));
      } else {
        console.log("  No symbols defined in this module");
      }
      return;
    }

    if (!force) {
      const confirmed = await confirmAction(`Are you sure you want to remove ${symbolName} from module ${moduleName}?`);
      if (!confirmed) {
        console.log('Operation cancelled.');
        return;
      }
    }

    // This functionality is likely custom implemented in the ModuleAwareEvaluator
    // Assuming a function like removeSymbolFromModule exists or using a workaround
    let removed = false;
    const currentModule = evaluator.getCurrentModuleSync();
    
    // Switch to the target module temporarily
    await evaluator.switchModule(moduleName);
    // Remove the symbol
    removed = evaluator.removeSymbol(symbolName);
    // Switch back to the original module
    await evaluator.switchModule(currentModule);
    
    if (removed) {
      console.log(`Removed ${symbolName} from module ${moduleName}`);
    } else {
      console.error(`Failed to remove ${symbolName} from module ${moduleName}`);
    }
    
    return;
  }

  // Check if target is a module
  const availableModules = await evaluator.getAvailableModules();
  if (availableModules.includes(target)) {
    // Don't allow removing protected modules
    const protectedModules = ['global', 'user'];
    if (protectedModules.includes(target)) {
      console.error(`Cannot remove protected module '${target}'`);
      console.log(`The 'global' module is a core system module that contains essential functionality.`);
      return;
    }
    
    if (!force) {
      const confirmed = await confirmAction(`Are you sure you want to remove module ${target}?`);
      if (!confirmed) {
        console.log('Operation cancelled.');
        return;
      }
    }

    // Handle removing the current module
    const isCurrentModule = replState.currentModule === target;
    
    // Remove the module
    const removed = await evaluator.removeModule(target);
    
    if (removed) {
      console.log(`Removed module ${target}`);
      
      // If we removed the current module, switch back to global
      if (isCurrentModule) {
        await evaluator.switchModule('global');
        replState.currentModule = 'global';
      }
    } else {
      console.error(`Failed to remove module ${target}`);
    }
    
    return;
  }

  // Assume the target is a symbol in the current module
  
  // Warn if trying to modify global module
  if (replState.currentModule === 'global' && !force) {
    console.log(`Warning: Removing symbols from the 'global' module is discouraged.`);
    console.log(`This module contains core functionality for the system.`);
    const confirmGlobal = await confirmAction(`Do you still want to proceed with removing '${target}' from 'global'?`);
    if (!confirmGlobal) {
      console.log('Operation cancelled.');
      return;
    }
  }
  
  if (!force) {
    const confirmed = await confirmAction(`Are you sure you want to remove symbol ${target}?`);
    if (!confirmed) {
      console.log('Operation cancelled.');
      return;
    }
  }

  // Force the removal to proceed
  const removed = evaluator.removeSymbol(target);
  
  if (removed) {
    console.log(`Removed symbol ${target}`);
  } else {
    console.error(`Failed to remove symbol ${target}`);
  }
  return;
}

/**
 * Handle the :verbose command
 */
export function commandVerbose(logger: { isVerbose: boolean }, setVerbose: (val: boolean) => void): void {
  const newValue = !logger.isVerbose;
  setVerbose(newValue);
  console.log(`Verbose mode ${newValue ? "enabled" : "disabled"}`);
}

/**
 * Handle the :ast command
 */
export function commandAst(showAst: boolean, setShowAst: (val: boolean) => void): void {
  const newValue = !showAst;
  setShowAst(newValue);
  console.log(`AST display ${newValue ? "enabled" : "disabled"}`);
}

/**
 * Handle the :expanded command
 */
export function commandExpanded(showExpanded: boolean, setShowExpanded: (val: boolean) => void): void {
  const newValue = !showExpanded;
  setShowExpanded(newValue);
  console.log(`Expanded form display ${newValue ? "enabled" : "disabled"}`);
}

/**
 * Handle the :js command
 */
export function commandJs(showJs: boolean, setShowJs: (val: boolean) => void): void {
  const newValue = !showJs;
  setShowJs(newValue);
  console.log(`JavaScript code display ${newValue ? "enabled" : "disabled"}`);
}