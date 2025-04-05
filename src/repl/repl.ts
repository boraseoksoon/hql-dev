// src/repl/enhanced-repl.ts - Comprehensive REPL with dynamic import support

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { keypress } from "https://deno.land/x/cliffy@v1.0.0-rc.3/keypress/mod.ts";
import { readLines } from "https://deno.land/std@0.224.0/io/read_lines.ts";
import { Logger } from "../logger.ts";
import { Environment } from "../environment.ts";
import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { loadSystemMacros } from "../transpiler/hql-transpiler.ts";
import { formatError, getSuggestion, registerSourceFile } from "../transpiler/error/error-handling.ts";
import { ImportError, TranspilerError } from "../transpiler/error/errors.ts";
import { historyManager } from "./history-manager.ts";
import * as termColors from "../utils/colors.ts";
import { persistentStateManager } from "./persistent-state-manager.ts";

// Collection of special symbols for autocomplete
const SPECIAL_SYMBOLS = new Set([
  "if", "when", "unless", "fn", "defn", "lambda", "let", "do", "cond", "case", 
  "while", "for", "import", "export", "loop", "recur", "try", "catch",
  "true", "false", "nil", "null", "undefined", "console.log", "print"
]);

interface ReplOptions {
  verbose?: boolean;
  baseDir?: string;
  historySize?: number;
  showAst?: boolean;
  showExpanded?: boolean;
  showJs?: boolean;
  initialFile?: string;
  useColors?: boolean;
  enableCompletion?: boolean;  // New option for symbol completion
}

/* ─────────────────────────────────────────────────────────────────────────────
   Color and Output Utilities
───────────────────────────────────────────────────────────────────────────── */
// Terminal color utilities
const colors = {
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

function printBlock(header: string, content: string, useColors = false): void {
  const headerText = useColors
    ? `${colors.fg.sicpRed}${colors.bright}${header}${colors.reset}`
    : header;
  console.log(headerText);
  console.log(content, "\n");
}

function colorText(text: string, colorCode: string, useColors = true): string {
  return useColors ? `${colorCode}${text}${colors.reset}` : text;
}

function printBanner(useColors = false): void {
  const headerColor = useColors ? colors.fg.sicpPurple + colors.bright : "";
  const textColor = useColors ? colors.fg.white : "";
  const commandColor = useColors ? colors.fg.sicpRed : "";
  const noteColor = useColors ? colors.fg.lightGreen : "";
  const reset = useColors ? colors.reset : "";
  const banner = [
    `${headerColor}╔════════════════════════════════════════════════════════════╗${reset}`,
    `${headerColor}║                ${textColor}HQL S-Expression REPL${headerColor}                        ║${reset}`,
    `${headerColor}╠════════════════════════════════════════════════════════════╣${reset}`,
    `${headerColor}║  ${textColor}Type HQL expressions to evaluate them${headerColor}                      ║${reset}`,
    `${headerColor}║  ${noteColor}The prompt ${textColor}hql[module]>${noteColor} shows your current module${headerColor}               ║${reset}`,
    `${headerColor}║  ${textColor}Special commands:${headerColor}                                          ║${reset}`,
    `${headerColor}║    ${commandColor}:help${textColor} - Display this help${headerColor}                                ║${reset}`,
    `${headerColor}║    ${commandColor}:quit${textColor}, ${commandColor}:exit${textColor} - Exit the REPL${headerColor}                             ║${reset}`,
    `${headerColor}║    ${commandColor}:env${textColor} - Show environment bindings${headerColor}                         ║${reset}`,
    `${headerColor}║    ${commandColor}:macros${textColor} - Show defined macros${headerColor}                            ║${reset}`,
    `${headerColor}║    ${commandColor}:module${textColor} - Switch to module or show current${headerColor}               ║${reset}`,
    `${headerColor}║    ${commandColor}:modules${textColor} - List all available modules${headerColor}                    ║${reset}`,
    `${headerColor}║    ${commandColor}:list${textColor} - Show symbols in current module${headerColor}                   ║${reset}`,
    `${headerColor}║    ${commandColor}:see${textColor} - Inspect modules and symbols${headerColor}                       ║${reset}`,
    `${headerColor}║    ${commandColor}:remove${textColor} - Remove a symbol or module${headerColor}                      ║${reset}`,
    `${headerColor}║    ${commandColor}:js${textColor} - Toggle JavaScript transpiled code display${headerColor}          ║${reset}`,
    `${headerColor}║    ${commandColor}:reset${textColor} - Reset REPL environment${headerColor}                          ║${reset}`,
    `${headerColor}╚════════════════════════════════════════════════════════════╝${reset}`
  ];
  banner.forEach(line => console.log(line));
}

function printError(msg: string, useColors: boolean): void {
  console.error(useColors ? `${colors.fg.red}${msg}${colors.reset}` : msg);
}

function getPrompt(state: ReplState, useColors: boolean): string {
  // Get the current module name
  const moduleName = state.currentModule || "user";
  
  if (useColors) {
    return state.multilineMode
      ? `${colors.fg.sicpPurple}${colors.bright}... ${colors.reset}`
      : `${colors.fg.sicpPurple}${colors.bright}hql[${colors.fg.sicpGreen}${moduleName}${colors.fg.sicpPurple}]> ${colors.reset}`;
  }
  return state.multilineMode ? "... " : `hql[${moduleName}]> `;
}

/* ─────────────────────────────────────────────────────────────────────────────
   REPL State Helpers
───────────────────────────────────────────────────────────────────────────── */
interface ReplState {
  multilineMode: boolean;
  multilineInput: string;
  parenBalance: number;
  importHandlerActive: boolean;
  currentModule: string;  // Added current module tracking
}

function resetReplState(state: ReplState): void {
  state.multilineMode = false;
  state.multilineInput = "";
  state.parenBalance = 0;
  // Don't reset currentModule - it should persist
}

function updateParenBalance(line: string, currentBalance: number): number {
  let balance = currentBalance;
  let inString = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    // Handle string literals to avoid counting parens inside them
    if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === "(") balance++;
      else if (char === ")") balance--;
    }
  }
  return balance;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Command Handlers
   (Each command is now a separate function)
───────────────────────────────────────────────────────────────────────────── */
function commandHelp(useColors: boolean): void {
  printBanner(useColors);
}

function commandQuit(setRunning: (val: boolean) => void): void {
  console.log("Exiting REPL...");
  
  // Force save state before exit
  persistentStateManager.forceSync();
  
  setRunning(false);
}

function commandEnv(evaluator: ModuleAwareEvaluator, useColors: boolean, logger: Logger): void {
  const env = evaluator.getEnvironment();
  console.log(colorText("Environment bindings:", colors.fg.sicpRed + colors.bright, useColors));
  
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
            `Error looking up ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
            useColors
          );
        }
      }
    });
    console.log("----------------");
  }
}

function formatValue(value: any): string {
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

function commandMacros(evaluator: ModuleAwareEvaluator, useColors: boolean): void {
  console.log(colorText("Defined macros:", colors.fg.sicpRed + colors.bright, useColors));
  const environment = evaluator.getEnvironment();
  console.log("Macro names:");
  console.log("------------");
  if (environment && "macros" in environment && environment.macros instanceof Map) {
    const macroKeys = Array.from(environment.macros.keys());
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

function commandModules(evaluator: ModuleAwareEvaluator, useColors: boolean): void {
  console.log(colorText("Available Modules:", colors.fg.sicpRed + colors.bright, useColors));
  
  // Get all modules from our module-aware evaluator
  const modules = evaluator.getAvailableModules();
  const currentModule = evaluator.getCurrentModule();
  
  if (modules.length === 0) {
    console.log("No modules defined");
  } else {
    console.log("Module names:");
    console.log("------------");
    for (const moduleName of modules) {
      const moduleMarker = moduleName === currentModule ? "* " : "  ";
      console.log(`${moduleMarker}${moduleName}`);
    }
    console.log("------------");
    console.log("* Current module");
  }
}

// New command to switch modules
function commandModule(evaluator: ModuleAwareEvaluator, state: ReplState, moduleName: string): void {
  // Check if module name is provided
  if (!moduleName) {
    // If no module name is provided, show the current module
    console.log(colorText(`Current module: ${evaluator.getCurrentModule()}`, 
                         colors.fg.sicpPurple + colors.bright, true));
    console.log(`The module name appears in your prompt: hql[${evaluator.getCurrentModule()}]>`);
    console.log(`Use :module <name> to switch to a different module`);
    return;
  }
  
  try {
    // Switch to the specified module
    evaluator.switchModule(moduleName);
    // Update REPL state
    state.currentModule = moduleName;
    console.log(`Switched to module: ${moduleName}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error switching to module: ${errorMessage}`);
  }
}

// New command to list symbols in the current module
function commandList(evaluator: ModuleAwareEvaluator, useColors: boolean): void {
  const currentModule = evaluator.getCurrentModule();
  console.log(colorText(`Symbols in module '${currentModule}':`, colors.fg.sicpRed + colors.bright, useColors));
  
  const symbols = evaluator.listModuleSymbols();
  
  if (symbols.length === 0) {
    console.log("No symbols defined");
  } else {
    console.log("Symbol names:");
    console.log("------------");
    for (const symbol of symbols.sort()) {
      console.log(`- ${symbol}`);
    }
    console.log("------------");
  }
}

// New command to remove a symbol or module
function commandRemove(evaluator: ModuleAwareEvaluator, state: ReplState, name: string): void {
  if (!name) {
    console.error("Usage: :remove <name>");
    return;
  }
  
  try {
    // First, check if it's a module
    const modules = evaluator.getAvailableModules();
    if (modules.includes(name)) {
      // It's a module, try to remove it
      const removed = evaluator.removeModule(name);
      if (removed) {
        console.log(`Removed module: ${name}`);
        // If we removed current module, update state
        if (state.currentModule === name) {
          state.currentModule = evaluator.getCurrentModule();
        }
      } else {
        console.error(`Cannot remove module: ${name}`);
      }
      return;
    }
    
    // If it's not a module, try as a symbol
    const removed = evaluator.removeSymbol(name);
    if (removed) {
      console.log(`Removed symbol: ${name}`);
    } else {
      console.error(`Symbol or module not found: ${name}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error removing symbol/module: ${errorMessage}`);
  }
}

function commandReset(evaluator: ModuleAwareEvaluator, state: ReplState, keepModules = false): void {
  console.log(`Resetting REPL environment${keepModules ? ' (keeping modules)' : ''}...`);
  evaluator.resetEnvironment(keepModules);
  // Update state with current module from evaluator
  state.currentModule = evaluator.getCurrentModule();
  console.log("Environment reset complete.");
}

function commandDefault(cmd: string): void {
  console.error(`Unknown command: ${cmd}`);
  console.log("Type :help for a list of commands");
}

function commandVerbose(logger: Logger, setVerbose: (val: boolean) => void): void {
  const newValue = !logger.isVerbose;
  setVerbose(newValue);
  console.log(`Verbose mode ${newValue ? 'enabled' : 'disabled'}`);
}

function commandAst(showAst: boolean, setShowAst: (val: boolean) => void): void {
  const newValue = !showAst;
  setShowAst(newValue);
  console.log(`AST display ${newValue ? 'enabled' : 'disabled'}`);
}

function commandExpanded(showExpanded: boolean, setShowExpanded: (val: boolean) => void): void {
  const newValue = !showExpanded;
  setShowExpanded(newValue);
  console.log(`Expanded form display ${newValue ? 'enabled' : 'disabled'}`);
}

function commandJs(showJs: boolean, setShowJs: (val: boolean) => void): void {
  const newValue = !showJs;
  setShowJs(newValue);
  if (newValue) {
    console.log("JavaScript transpiled code display is now enabled.");
    console.log("For each HQL expression, you'll now see the transpiled JavaScript.");
  } else {
    console.log("JavaScript transpiled code display is now disabled.");
  }
}

// New command to show symbol definitions
function commandSee(evaluator: ModuleAwareEvaluator, args: string, useColors: boolean, showJs: boolean = false): void {
  // No arguments: list all modules with their exported symbols
  if (!args || args.trim() === "") {
    const modules = evaluator.getAvailableModules();
    console.log(colorText("Available Modules:", colors.fg.sicpRed + colors.bright, useColors));
    
    if (modules.length === 0) {
      console.log("No modules defined");
    } else {
      // Show a summary first
      console.log(colorText(`Found ${modules.length} module(s)`, colors.fg.white + colors.bright, useColors));
      console.log(colorText("Module list:", colors.fg.sicpBlue, useColors) + " " + 
                  colorText(modules.join(", "), colors.fg.sicpPurple, useColors));
      console.log(colorText("─".repeat(60), colors.fg.white, useColors));
      
      modules.forEach(moduleName => {
        // Get symbols and exports for this module
        const symbols = evaluator.listModuleSymbols(moduleName);
        const exports = evaluator.getModuleExports(moduleName);
        
        // Show module name with better highlighting
        console.log(colorText(`\n▶ Module: ${moduleName}`, colors.fg.sicpPurple + colors.bright, useColors));
        
        // Categorize symbols by type
        const functionSymbols: string[] = [];
        const variableSymbols: string[] = [];
        const otherSymbols: string[] = [];
        
        symbols.forEach(symbol => {
          const definition = evaluator.getSymbolDefinition(symbol, moduleName);
          if (definition) {
            if (typeof definition.value === 'function') {
              functionSymbols.push(symbol);
            } else {
              variableSymbols.push(symbol);
            }
          } else {
            otherSymbols.push(symbol);
          }
        });
        
        // Create set of exported symbols for easy lookup
        const exportSet = new Set(exports);
        
        // Display all symbols grouped by type
        if (functionSymbols.length > 0) {
          console.log(colorText("  Functions:", colors.fg.sicpGreen, useColors));
          functionSymbols.sort().forEach(symbol => {
            const isExported = exportSet.has(symbol);
            const symbolDisplay = isExported 
              ? colorText(symbol, colors.fg.green + colors.bright, useColors) + colorText(" (exported)", colors.fg.green, useColors)
              : symbol;
            console.log(`    - ${symbolDisplay}`);
          });
        }
        
        if (variableSymbols.length > 0) {
          console.log(colorText("  Variables:", colors.fg.sicpBlue, useColors));
          variableSymbols.sort().forEach(symbol => {
            const isExported = exportSet.has(symbol);
            const symbolDisplay = isExported 
              ? colorText(symbol, colors.fg.green + colors.bright, useColors) + colorText(" (exported)", colors.fg.green, useColors)
              : symbol;
            console.log(`    - ${symbolDisplay}`);
          });
        }
        
        if (otherSymbols.length > 0) {
          console.log(colorText("  Other:", colors.fg.yellow, useColors));
          otherSymbols.sort().forEach(symbol => {
            const isExported = exportSet.has(symbol);
            const symbolDisplay = isExported 
              ? colorText(symbol, colors.fg.green + colors.bright, useColors) + colorText(" (exported)", colors.fg.green, useColors)
              : symbol;
            console.log(`    - ${symbolDisplay}`);
          });
        }
        
        // Show summary of exports if any
        if (exports.length > 0) {
          console.log(colorText("  Summary of exports:", colors.fg.lightGreen + colors.bright, useColors));
          console.log(`    ${colorText(exports.join(", "), colors.fg.green, useColors)}`);
        }
      });
      
      console.log(colorText("\nUsage:", colors.fg.cyan, useColors));
      console.log(`  :see <module> - View detailed symbols in a specific module`);
      console.log(`  :see <module:symbol> - View a specific symbol definition`);
    }
    return;
  }
  
  // Check if symbol contains module prefix (module:symbol format)
  if (args.includes(':')) {
    const [moduleName, localSymbolName] = args.split(':');
    
    // Try to get the symbol definition
    const definition = evaluator.getSymbolDefinition(localSymbolName.trim(), moduleName.trim());
    
    if (!definition) {
      console.error(`Symbol '${args}' not found or has no stored definition.`);
      return;
    }
    
    console.log(colorText(`Definition of '${args}':`, colors.fg.sicpRed + colors.bright, useColors));
    console.log("----------------");
    
    // Display the source code - prefer HQL source over JS
    if (definition.source) {
      console.log(colorText("HQL Source:", colors.fg.sicpGreen, useColors));
      console.log(definition.source);
    }
    
    // Only show the JS source if specifically enabled
    if (definition.jsSource && showJs) {
      console.log(colorText("\nJavaScript Transpilation:", colors.fg.yellow, useColors));
      console.log(definition.jsSource);
    }
    
    // Show value if no source is available
    if (!definition.source && !definition.jsSource) {
      if (typeof definition.value === 'function') {
        // For functions without source, show the function representation
        console.log(colorText("Function:", colors.fg.sicpGreen, useColors));
        console.log(definition.value.toString());
      } else {
        console.log(colorText("Value:", colors.fg.sicpBlue, useColors));
        console.log(formatValue(definition.value));
      }
    }
    
    // Show metadata if available
    if (definition.metadata) {
      console.log(colorText("\nMetadata:", colors.fg.lightBlue, useColors));
      console.log(definition.metadata);
    }
    
    console.log("----------------");
    console.log("To use this symbol in HQL, import it with:");
    console.log(`(import [${localSymbolName.trim()}] from "${moduleName.trim()}")`);
    console.log("----------------");
    return;
  }
  
  // Check if this might be a symbol in the current module
  const singleArg = args.trim();
  const currentModule = evaluator.getCurrentModule();
  const symbols = evaluator.listModuleSymbols(currentModule);
  
  if (symbols.includes(singleArg)) {
    // This is a symbol in the current module - show its definition
    const definition = evaluator.getSymbolDefinition(singleArg, currentModule);
    
    if (definition) {
      console.log(colorText(`Definition of '${singleArg}' in current module '${currentModule}':`, 
                           colors.fg.sicpRed + colors.bright, useColors));
      console.log("----------------");
      
      // Display the source code - prefer HQL source over JS
      if (definition.source) {
        console.log(colorText("HQL Source:", colors.fg.sicpGreen, useColors));
        console.log(definition.source);
      }
      
      // Only show the JS source if specifically enabled
      if (definition.jsSource && showJs) {
        console.log(colorText("\nJavaScript Transpilation:", colors.fg.yellow, useColors));
        console.log(definition.jsSource);
      }
      
      // Show value if no source is available
      if (!definition.source && !definition.jsSource) {
        if (typeof definition.value === 'function') {
          // For functions without source, show the function representation
          console.log(colorText("Function:", colors.fg.sicpGreen, useColors));
          console.log(definition.value.toString());
        } else {
          console.log(colorText("Value:", colors.fg.sicpBlue, useColors));
          console.log(formatValue(definition.value));
        }
      }
      
      // Show metadata if available
      if (definition.metadata) {
        console.log(colorText("\nMetadata:", colors.fg.lightBlue, useColors));
        console.log(definition.metadata);
      }
      
      console.log("----------------");
      return;
    }
  }
  
  // If it's not a symbol in the current module, it must be a module name
  const moduleName = singleArg;
  const moduleSymbols = evaluator.listModuleSymbols(moduleName);
  
  if (!moduleSymbols || moduleSymbols.length === 0) {
    console.error(`Module or symbol '${moduleName}' not found.`);
    console.log(`Use :modules to see list of available modules`);
    console.log(`To see a symbol in the current module (${currentModule}), use :see symbol`);
    console.log(`To see a symbol in another module, use :see module:symbol`);
    return;
  }
  
  // If we reach here, it's a valid module name
  console.log(colorText(`Symbols in module '${moduleName}':`, colors.fg.sicpRed + colors.bright, useColors));
  
  // Get all exported symbols for highlighting
  const exports = evaluator.getModuleExports(moduleName);
  const exportSet = new Set(exports);
  
  // Categorize symbols by type
  const functionSymbols: string[] = [];
  const variableSymbols: string[] = [];
  const otherSymbols: string[] = [];
  
  moduleSymbols.forEach(symbol => {
    const definition = evaluator.getSymbolDefinition(symbol, moduleName);
    if (definition) {
      if (typeof definition.value === 'function') {
        functionSymbols.push(symbol);
      } else {
        variableSymbols.push(symbol);
      }
    } else {
      otherSymbols.push(symbol);
    }
  });
  
  // Display functions
  if (functionSymbols.length > 0) {
    console.log(colorText("\nFunctions:", colors.fg.sicpGreen + colors.bright, useColors));
    console.log("------------");
    functionSymbols.sort().forEach(symbol => {
      const isExported = exportSet.has(symbol);
      const marker = isExported ? colorText(' (exported)', colors.fg.green, useColors) : '';
      console.log(`- ${symbol}${marker}`);
    });
  }
  
  // Display variables
  if (variableSymbols.length > 0) {
    console.log(colorText("\nVariables:", colors.fg.sicpBlue + colors.bright, useColors));
    console.log("------------");
    variableSymbols.sort().forEach(symbol => {
      const isExported = exportSet.has(symbol);
      const marker = isExported ? colorText(' (exported)', colors.fg.green, useColors) : '';
      console.log(`- ${symbol}${marker}`);
    });
  }
  
  // Display other symbols if any
  if (otherSymbols.length > 0) {
    console.log(colorText("\nOther Symbols:", colors.fg.yellow + colors.bright, useColors));
    console.log("------------");
    otherSymbols.sort().forEach(symbol => {
      const isExported = exportSet.has(symbol);
      const marker = isExported ? colorText(' (exported)', colors.fg.green, useColors) : '';
      console.log(`- ${symbol}${marker}`);
    });
  }
  
  console.log("\nUse :see " + moduleName + ":<symbol> to view a specific symbol definition");
  console.log("To use symbols from this module in HQL, import them with:");
  console.log(`(import [symbol1, symbol2] from "${moduleName}")`);
  console.log("------------");
}

/* ─────────────────────────────────────────────────────────────────────────────
   REPL Input Handling Helpers
───────────────────────────────────────────────────────────────────────────── */
// We now return an object indicating if the input was obtained via history navigation.
interface ReadLineResult {
  text: string;
  fromHistory: boolean;
  controlD: boolean;
}

async function readLineWithHistory(
  prompt: string, 
  history: string[], 
  state: ReplState
): Promise<ReadLineResult> {
  const encoder = new TextEncoder();
  await Deno.stdout.write(encoder.encode(prompt));
  let currentInput = "", cursorPos = 0, historyIndex = history.length;
  let historyNavigated = false;

  const redrawLine = async () => {
    await Deno.stdout.write(encoder.encode("\r\x1b[K" + prompt + currentInput));
    if (cursorPos < currentInput.length) {
      await Deno.stdout.write(encoder.encode(`\x1b[${currentInput.length - cursorPos}D`));
    }
  };

  const deleteWord = async () => {
    if (cursorPos > 0) {
      let newPos = cursorPos - 1;
      while (newPos > 0 && /\s/.test(currentInput[newPos])) newPos--;
      while (newPos > 0 && !/\s/.test(currentInput[newPos - 1])) newPos--;
      currentInput = currentInput.slice(0, newPos) + currentInput.slice(cursorPos);
      cursorPos = newPos;
      await redrawLine();
    }
  };

  while (true) {
    const key = await keypress();

    if (key?.ctrlKey && key.key === "c") {
      await Deno.stdout.write(encoder.encode("\nExiting REPL...\n"));
      Deno.exit(0);
    } else if (key?.ctrlKey && key.key === "d") {
      // Special handling for Ctrl+D (EOF)
      if (currentInput.length === 0) {
        await Deno.stdout.write(encoder.encode("\n"));
        return { text: "", fromHistory: false, controlD: true };
      }
    } else if (key?.key === "return") {
      await Deno.stdout.write(encoder.encode("\n"));
      if (currentInput.trim() && (history.length === 0 || history[history.length - 1] !== currentInput)) {
        history.push(currentInput);
      }
      return { text: currentInput, fromHistory: historyNavigated, controlD: false };
    } else if (key?.key === "backspace") {
      if (cursorPos > 0) {
        currentInput = currentInput.slice(0, cursorPos - 1) + currentInput.slice(cursorPos);
        cursorPos--;
        await redrawLine();
      }
    } else if (key?.key === "delete") {
      if (cursorPos < currentInput.length) {
        currentInput = currentInput.slice(0, cursorPos) + currentInput.slice(cursorPos + 1);
        await redrawLine();
      }
    } else if (key?.key === "left") {
      if (cursorPos > 0) { cursorPos--; await redrawLine(); }
    } else if (key?.key === "right") {
      if (cursorPos < currentInput.length) { cursorPos++; await redrawLine(); }
    } else if (key?.key === "up") {
      if (historyIndex > 0) {
        historyIndex--;
        currentInput = history[historyIndex];
        cursorPos = currentInput.length;
        historyNavigated = true;
        await redrawLine();
      }
    } else if (key?.key === "down") {
      if (historyIndex < history.length - 1) {
        historyIndex++;
        currentInput = history[historyIndex];
        cursorPos = currentInput.length;
        historyNavigated = true;
        await redrawLine();
      } else if (historyIndex === history.length - 1) {
        historyIndex = history.length;
        currentInput = "";
        cursorPos = 0;
        historyNavigated = true;
        await redrawLine();
      }
    } else if (key?.key === "tab") {
      currentInput = currentInput.slice(0, cursorPos) + "  " + currentInput.slice(cursorPos);
      cursorPos += 2;
      await redrawLine();
    } else if (key?.key === "home") {
      cursorPos = 0;
      await redrawLine();
    } else if (key?.key === "end") {
      cursorPos = currentInput.length;
      await redrawLine();
    } else if (key?.ctrlKey && key.key === "w") {
      await deleteWord();
    } else if (key?.ctrlKey && key.key === "e") {
      cursorPos = currentInput.length;
      await redrawLine();
    } else if ((key?.ctrlKey && key.key === "a") || (key?.metaKey && key.key === "a")) {
      cursorPos = 0;
      await redrawLine();
    } else if (key?.ctrlKey && key.key === "k") {
      currentInput = currentInput.slice(0, cursorPos);
      await redrawLine();
    } else if (key?.ctrlKey && key.key === "u") {
      currentInput = currentInput.slice(cursorPos);
      cursorPos = 0;
      await redrawLine();
    } else if (key?.ctrlKey && key.key === "l") {
      await Deno.stdout.write(encoder.encode("\x1b[2J\x1b[H"));
      await redrawLine();
    } else if ((key?.altKey && key.key === "b") || (key?.ctrlKey && key.key === "left")) {
      if (cursorPos > 0) {
        let newPos = cursorPos - 1;
        while (newPos > 0 && /\s/.test(currentInput[newPos])) newPos--;
        while (newPos > 0 && !/\s/.test(currentInput[newPos - 1])) newPos--;
        cursorPos = newPos;
        await redrawLine();
      }
    } else if ((key?.altKey && key.key === "f") || (key?.ctrlKey && key.key === "right")) {
      if (cursorPos < currentInput.length) {
        let newPos = cursorPos;
        while (newPos < currentInput.length && !/\s/.test(currentInput[newPos])) newPos++;
        while (newPos < currentInput.length && /\s/.test(currentInput[newPos])) newPos++;
        cursorPos = newPos;
        await redrawLine();
      }
    } else if (key?.sequence) {
      // Accept sequences of any length - this handles pasted text naturally
      currentInput = currentInput.slice(0, cursorPos) + key.sequence + currentInput.slice(cursorPos);
      cursorPos += key.sequence.length;
      await redrawLine();
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   REPL Input Processing
   This helper decides whether the input is a command, a multiline continuation,
   or a complete expression ready for evaluation.
───────────────────────────────────────────────────────────────────────────── */
interface ProcessOptions {
  logger: Logger;
  baseDir: string;
  historySize: number;
  showAst: boolean;
  showExpanded: boolean;
  showJs: boolean;
  useColors: boolean;
  trackSymbolUsage?: (symbol: string) => void;
  replState: {
    setRunning: (val: boolean) => void;
    setVerbose: (val: boolean) => void;
    setColors: (val: boolean) => void;
    setShowAst: (val: boolean) => void;
    setShowExpanded: (val: boolean) => void;
    setShowJs: (val: boolean) => void;
  };
}

async function handleReplLine(
  lineResult: ReadLineResult,
  state: ReplState,
  evaluator: ModuleAwareEvaluator,
  history: string[],
  options: ProcessOptions
): Promise<void> {
  // Process the input text
  state.parenBalance = updateParenBalance(lineResult.text, state.parenBalance);

  if (state.multilineMode) {
    // If coming from history navigation, do not add an extra newline.
    state.multilineInput += lineResult.fromHistory ? lineResult.text : lineResult.text + "\n";
    if (state.parenBalance <= 0) {
      state.multilineMode = false;
      await processInput(state.multilineInput, evaluator, history, options, state);
      resetReplState(state);
    }
  } else if (lineResult.text.startsWith(":")) {
    // Strip the leading colon
    const command = lineResult.text.substring(1);
    await handleCommand(command, state, evaluator, history, options);
  } else if (state.parenBalance > 0) {
    state.multilineMode = true;
    state.multilineInput = lineResult.text + "\n";
  } else {
    await processInput(lineResult.text, evaluator, history, options, state);
  }
}

async function processInput(
  input: string,
  evaluator: ModuleAwareEvaluator,
  history: string[],
  options: ProcessOptions,
  state: ReplState
): Promise<void> {
  // Skip empty input
  input = input.trim();
  if (!input) return;
  
  // Register input source for error context
  registerSourceFile("REPL", input);
  
  try {
    // Check if this is a command (starts with ":")
    if (input.startsWith(":")) {
      const command = input.substring(1);
      await handleCommand(command, state, evaluator, history, options);
      return;
    }
    
    // Check for special HQL expressions (like imports and exports)
    const isSpecialExpression = await evaluator.detectSpecialHqlExpressions(input);
    if (isSpecialExpression) {
      // The expression was handled, update state if needed
      state.currentModule = evaluator.getCurrentModule();
      return;
    }
    
    // Pre-check for HQL function redeclarations
    const hqlFuncMatch = input.match(/\(\s*(?:fn|defn)\s+([a-zA-Z_$][a-zA-Z0-9_$-]*)/);
    if (hqlFuncMatch && hqlFuncMatch[1]) {
      const funcName = hqlFuncMatch[1];
      const replEnv = (evaluator as any).getREPLEnvironment();
      
      // Check if function already exists
      if (replEnv.hasJsValue(funcName)) {
        console.log(`Symbol '${funcName}' already exists. Overwrite? (y/n)`);
        
        // Read response
        const response = await readLineWithHistory("> ", [], { 
          multilineMode: false, 
          multilineInput: "", 
          parenBalance: 0,
          importHandlerActive: false,
          currentModule: state.currentModule
        });
        
        // If confirmed, force redefine
        if (response.text.trim().toLowerCase() === "y") {
          console.log(`Overwriting '${funcName}'...`);
          const result = await evaluator.forceDefine(input);
          formatAndDisplayResult(result, input, options, performance.now());
          return;
        } else {
          console.log(`Keeping existing definition for '${funcName}'`);
          return;
        }
      }
    }
    
    // Add to history
    if (history[history.length - 1] !== input) {
      history.push(input);
    }
    
    // Regular expression evaluation
    const startTime = performance.now();
    try {
      const result = await evaluator.evaluate(input, {
        verbose: options.logger.isVerbose,
        baseDir: options.baseDir,
        showAst: options.showAst,
        showExpanded: options.showExpanded,
        showJs: options.showJs,
      });
      const executionTime = performance.now() - startTime;
      
      // Display JS if enabled
      if (options.showJs) {
        printBlock("JavaScript:", result.jsCode, options.useColors);
      }
      
      // Track symbol usage if provided
      if (options.trackSymbolUsage) {
        trackSymbolsInInput(input, options.trackSymbolUsage);
      }
      
      // Display result
      formatAndDisplayResult(result.value, input, options, executionTime);
    } catch (error) {
      // Check if this is a redeclaration error
      if (error instanceof Error && 
         (error.message.includes("has already been declared") || 
          (error as any).isRedeclarationError)) {
        
        const identifiers = (error as any).identifiers || [];
        const identifier = identifiers.length > 0 ? 
                          identifiers[0] : 
                          error.message.match(/Identifier '([^']+)' has/)?.[1] || "symbol";
        
        // Ask for confirmation to overwrite
        console.log(`Symbol '${identifier}' already exists. Overwrite? (y/n)`);
        
        // Read response
        const response = await readLineWithHistory("> ", [], { 
          multilineMode: false, 
          multilineInput: "", 
          parenBalance: 0,
          importHandlerActive: false,
          currentModule: state.currentModule
        });
        
        // If confirmed, force redefine
        if (response.text.trim().toLowerCase() === "y") {
          console.log(`Overwriting '${identifier}'...`);
          const result = await evaluator.forceDefine(input);
          formatAndDisplayResult(result, input, options, performance.now() - startTime);
        } else {
          console.log(`Keeping existing definition for '${identifier}'`);
        }
        return;
      }
      
      // For other errors, just rethrow
      throw error;
    }
  } catch (error: unknown) {
    handleError(error, options);
  }
}

// Helper function to format and display result
function formatAndDisplayResult(result: any, input: string, options: ProcessOptions, executionTime: number): void {
  // Check if result is a proper object with value property
  if (result && typeof result === 'object' && 'value' in result) {
    // Format the result value based on its type
    let displayValue = formatResultValue(result.value, options.useColors);
    console.log(displayValue);
  } else if (result !== undefined) {
    // Handle direct result values (not wrapped in object)
    let displayValue = formatResultValue(result, options.useColors);
    console.log(displayValue);
  } else if (input.trim().startsWith("(fn ") || input.trim().startsWith("(defn ")) {
    // Handle function definitions
    const match = input.trim().match(/\((?:fn|defn)\s+([a-zA-Z0-9_-]+)/);
    const functionName = match ? match[1] : "anonymous";
    console.log(options.useColors
      ? `${colors.fg.lightGreen}Function ${functionName} defined${colors.reset}`
      : `Function ${functionName} defined`);
  } else if (input.trim().startsWith("(def ")) {
    // Handle variable definitions
    const match = input.trim().match(/\(def\s+([a-zA-Z0-9_-]+)/);
    const varName = match ? match[1] : "value";
    console.log(options.useColors
      ? `${colors.fg.lightGreen}Variable ${varName} defined${colors.reset}`
      : `Variable ${varName} defined`);
  } else {
    // Handle undefined results
    console.log(options.useColors
      ? `${colors.fg.lightBlue}undefined${colors.reset}`
      : "undefined");
  }
  
  // Show execution time if verbose
  if (options.logger.isVerbose) {
    console.log(options.useColors
      ? `${colors.fg.gray}// Execution time: ${executionTime.toFixed(2)}ms${colors.reset}`
      : `// Execution time: ${executionTime.toFixed(2)}ms`);
  }
}

// Helper to format result values with proper coloring
function formatResultValue(value: any, useColors: boolean): string {
  if (value === null) {
    return useColors ? `${colors.fg.lightBlue}null${colors.reset}` : "null";
  }
  
  if (value === undefined) {
    return useColors ? `${colors.fg.lightBlue}undefined${colors.reset}` : "undefined";
  }
  
  if (typeof value === "number") {
    return useColors ? `${colors.fg.lightGreen}${value}${colors.reset}` : String(value);
  }
  
  if (typeof value === "string") {
    return useColors ? `${colors.fg.lightYellow}"${value}"${colors.reset}` : `"${value}"`;
  }
  
  if (typeof value === "boolean") {
    return useColors ? `${colors.fg.lightPurple}${value}${colors.reset}` : String(value);
  }
  
  if (typeof value === "function") {
    return useColors 
      ? `${colors.fg.lightCyan}[Function${value.name ? ': ' + value.name : ''}]${colors.reset}`
      : `[Function${value.name ? ': ' + value.name : ''}]`;
  }
  
  if (typeof value === "object") {
    try {
      if (Array.isArray(value)) {
        // Format arrays more nicely
        const json = JSON.stringify(value, null, 2);
        return useColors ? `${colors.fg.lightCyan}${json}${colors.reset}` : json;
      }
      
      // Format objects
      const json = JSON.stringify(value, null, 2);
      return useColors ? `${colors.fg.lightCyan}${json}${colors.reset}` : json;
    } catch {
      return useColors ? `${colors.fg.lightCyan}[Object]${colors.reset}` : "[Object]";
    }
  }
  
  return String(value);
}

// Track symbols used in input
function trackSymbolsInInput(input: string, tracker: (symbol: string) => void): void {
  const symbolRegex = /\b[a-zA-Z0-9_-]+\b/g;
  let match;
  while ((match = symbolRegex.exec(input)) !== null) {
    tracker(match[0]);
  }
}

// Enhanced error handling
function handleError(error: unknown, options: ProcessOptions): void {
  if (error instanceof Error) {
    // Format error with source context
    const formattedError = formatError(error, { 
      useColors: options.useColors, 
      filePath: "REPL input",
      includeStack: options.logger.isVerbose, // Include stack trace in verbose mode
    });
    
    // Display the detailed error
    console.error(formattedError);
    
    // Show helpful suggestion
    const suggestion = getSuggestion(error);
    if (suggestion) {
      console.error(options.useColors
        ? `${colors.fg.cyan}Suggestion: ${suggestion}${colors.reset}`
        : `Suggestion: ${suggestion}`);
    }
  } else {
    // Fallback for non-Error objects
    console.error(options.useColors
      ? `${colors.fg.red}Error: ${String(error)}${colors.reset}`
      : `Error: ${String(error)}`);
  }
}

/**
 * Check if an input string looks like an import statement
 */
function isImportExpression(input: string): boolean {
  input = input.trim();
  
  // Check for HQL import syntax: (import name from "path")
  if (input.startsWith('(import ') && input.includes(' from ') && input.endsWith(')')) {
    return true;
  }
  
  // Check for vector import syntax: (import [a b c] from "path")
  if (input.startsWith('(import [') && input.includes('] from "') && input.endsWith(')')) {
    return true;
  }
  
  // Check for simple import: (import "path")
  if (input.startsWith('(import "') && input.endsWith('")')) {
    return true;
  }
  
  return false;
}

/**
 * Handle an import expression by using the DynamicImportHandler
 */
// This function is no longer needed as we're using evaluator.processImportDirectly

/* ─────────────────────────────────────────────────────────────────────────────
   Command Handling Dispatcher
───────────────────────────────────────────────────────────────────────────── */
async function handleCommand(
  command: string,
  state: ReplState,
  evaluator: ModuleAwareEvaluator,
  history: string[],
  options: ProcessOptions
): Promise<void> {
  // Split the command string into parts
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1).join(" ");

  switch (cmd) {
    case "help":
      commandHelp(options.useColors);
      break;
    case "quit":
    case "exit":
      commandQuit(options.replState.setRunning);
      break;
    case "env":
      commandEnv(evaluator, options.useColors, options.logger);
      break;
    case "macros":
      commandMacros(evaluator, options.useColors);
      break;
    case "verbose":
      commandVerbose(options.logger, options.replState.setVerbose);
      break;
    case "ast":
      commandAst(options.showAst, options.replState.setShowAst);
      break;
    case "expanded":
      commandExpanded(options.showExpanded, options.replState.setShowExpanded);
      break;
    case "js":
      commandJs(options.showJs, options.replState.setShowJs);
      break;
    case "modules":
      commandModules(evaluator, options.useColors);
      break;
    case "module":
      commandModule(evaluator, state, args);
      break;
    case "list":
      commandList(evaluator, options.useColors);
      break;
    case "see":
      commandSee(evaluator, args, options.useColors, options.showJs);
      break;
    case "remove":
      commandRemove(evaluator, state, args);
      break;
    case "reset":
      const keepModules = args === "--keep-modules" || args === "-k";
      commandReset(evaluator, state, keepModules);
      break;
    default:
      commandDefault(cmd);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main REPL Loop
───────────────────────────────────────────────────────────────────────────── */
export async function startRepl(options: ReplOptions = {}): Promise<void> {
  const logger = new Logger(options.verbose ?? false);
  const baseDir = options.baseDir ?? Deno.cwd();
  const historySize = options.historySize ?? 100;
  const { 
    showAst = false, 
    showExpanded = false, 
    showJs = false, 
    useColors = true,
  } = options;

  let running = true;
  const history: string[] = historyManager.load(historySize);
  const replStateObj: ReplState = { 
    multilineMode: false, 
    multilineInput: "", 
    parenBalance: 0,
    importHandlerActive: false,
    currentModule: "user"  // Default module
  };

  const stateFunctions = {
    setRunning: (val: boolean) => { running = val; },
    setVerbose: logger.setEnabled.bind(logger),
    setColors: (val: boolean) => { /* update local flag if needed */ },
    setShowAst: (val: boolean) => { options.showAst = val; },
    setShowExpanded: (val: boolean) => { options.showExpanded = val; },
    setShowJs: (val: boolean) => { options.showJs = val; },
  };

  const trackSymbolUsage = (symbol: string) => logger.debug(`Symbol used: ${symbol}`);

  printBanner(useColors);
  logger.log({ text: "Initializing environment...", namespace: "repl" });

  try {
    // Initialize environment
    const env = await Environment.initializeGlobalEnv({ verbose: options.verbose });
    await loadSystemMacros(env, { verbose: options.verbose, baseDir: Deno.cwd() });
    
    // Create new module-aware evaluator
    const evaluator = new ModuleAwareEvaluator(env, {
      verbose: options.verbose,
      baseDir,
      showAst,
      showExpanded,
      showJs,
    });
    
    // Initialize with current module
    replStateObj.currentModule = evaluator.getCurrentModule();
    
    // Log available macros in verbose mode
    if (options.verbose) {
      logger.log({ 
        text: `Available macros: ${[...env.macros.keys()].join(", ")}`, 
        namespace: "repl" 
      });
    }

    // Start REPL loop
    while (running) {
      try {
        const prompt = getPrompt(replStateObj, useColors);
        const lineResult = await readLineWithHistory(prompt, history, replStateObj);
        
        // Save history after each command
        historyManager.save(history.slice(-historySize));
        
        if (!lineResult.text.trim() && !lineResult.controlD) continue;
        
        await handleReplLine(lineResult, replStateObj, evaluator, history, {
          logger,
          baseDir,
          historySize,
          showAst,
          showExpanded,
          showJs,
          useColors,
          trackSymbolUsage,
          replState: stateFunctions,
        });
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
          useColors
        );
      }
    }
  } catch (error) {
    console.error(
      `REPL initialization error: ${error instanceof Error ? error.message : String(error)}`
    );
    Deno.exit(1);
  }
}