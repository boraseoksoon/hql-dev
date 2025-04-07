// src/repl/enhanced-repl.ts - Comprehensive REPL with dynamic import support

import { keypress } from "https://deno.land/x/cliffy@v1.0.0-rc.3/keypress/mod.ts";
import { Logger } from "../logger.ts";
import { Environment } from "../environment.ts";
import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { loadSystemMacros } from "../transpiler/hql-transpiler.ts";
import { formatError, getSuggestion, registerSourceFile } from "../transpiler/error/error-handling.ts";
import { historyManager } from "./history-manager.ts";
import * as termColors from "../utils/colors.ts";
import { persistentStateManager } from "./persistent-state-manager.ts";

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
    `${headerColor}║    ${commandColor}:help${textColor} - Display help (use ${commandColor}:help <command>${textColor} for details)     ║${reset}`,
    `${headerColor}║    ${commandColor}:quit${textColor}, ${commandColor}:exit${textColor} - Exit the REPL${headerColor}                             ║${reset}`,
    `${headerColor}║    ${commandColor}:env${textColor} - Show environment bindings${headerColor}                         ║${reset}`,
    `${headerColor}║    ${commandColor}:macros${textColor} - Show defined macros${headerColor}                            ║${reset}`,
    `${headerColor}║    ${commandColor}:module${textColor} - Switch to module or show current${headerColor}               ║${reset}`,
    `${headerColor}║    ${commandColor}:modules${textColor} - List all available modules${headerColor}                    ║${reset}`,
    `${headerColor}║    ${commandColor}:list${textColor} - Show symbols in current module${headerColor}                   ║${reset}`,
    `${headerColor}║    ${commandColor}:see${textColor} - Inspect modules and symbols${headerColor}                       ║${reset}`,
    `${headerColor}║    ${commandColor}:remove${textColor} - Remove a symbol or module${headerColor}                      ║${reset}`,
    `${headerColor}║    ${commandColor}:verbose ${textColor}[expr] - Toggle verbose mode or evaluate with details${headerColor} ║${reset}`,
    `${headerColor}║    ${commandColor}:ast ${textColor}[expr] - Toggle AST display or show AST for expression${headerColor}    ║${reset}`,
    `${headerColor}║    ${commandColor}:js ${textColor}[expr] - Show JavaScript transpilation for expression${headerColor}      ║${reset}`,
    `${headerColor}╚════════════════════════════════════════════════════════════╝${reset}`
  ];
  banner.forEach(line => console.log(line));
}

function printError(msg: string, useColors: boolean): void {
  console.error(useColors ? `${colors.fg.red}${msg}${colors.reset}` : msg);
}

function getPrompt(state: ReplState, useColors: boolean): string {
  // Get the current module name
  const moduleName = state.currentModule || "global";
  
  if (useColors) {
    return state.multilineMode
      ? `${colors.fg.sicpPurple}${colors.bright}... ${colors.reset}`
      : `${colors.fg.sicpPurple}${colors.bright}hql[${colors.fg.sicpRed}${moduleName}${colors.fg.sicpPurple}]> ${colors.reset}`;
  }
  return state.multilineMode ? "... " : `hql[${moduleName}]> `;
}

/* ─────────────────────────────────────────────────────────────────────────────
   REPL State Helpers
───────────────────────────────────────────────────────────────────────────── */
// Define the ReplState interface first - with bracketStack property
interface ReplState {
  multilineMode: boolean;
  multilineInput: string;
  parenBalance: number;
  importHandlerActive: boolean;
  currentModule: string;
  bracketStack: string[];  // Added to track opening brackets
}

// Then update the resetReplState function to include the bracketStack
function resetReplState(state: ReplState): void {
  state.multilineMode = false;
  state.multilineInput = "";
  state.parenBalance = 0;
  state.importHandlerActive = false;
  state.bracketStack = [];  // Reset bracket stack
}

function updateParenBalance(line: string, currentBalance: number): number {
  const result = getUnbalancedBrackets(line);
  return currentBalance + result.balance;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Command Handlers
   (Each command is now a separate function)
───────────────────────────────────────────────────────────────────────────── */
function commandHelp(args: string, useColors: boolean): void {
  if (!args || args.trim() === "") {
    // No arguments, just show the banner
    printBanner(useColors);
  } else {
    // Show detailed help for a specific command
    // Remove any leading colon to support both `:help command` and `:help :command` formats
    let command = args.trim().toLowerCase();
    if (command.startsWith(':')) {
      command = command.substring(1);
    }
    console.log(`Showing help for command: ${command}`);
    const helpText = getDetailedHelp(command, useColors);
    console.log(helpText);
  }
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

// Command handler for :modules command
async function commandModules(evaluator: ModuleAwareEvaluator, useColors: boolean): Promise<void> {
  console.log(colorText("Available modules:", colors.fg.sicpRed + colors.bright, useColors));
  
  const modules = await evaluator.getAvailableModules();
  
  if (modules.length === 0) {
    console.log("No modules defined");
  } else {
    console.log("Modules:");
    console.log("---------");
    modules.forEach(moduleName => {
      const isCurrent = moduleName === evaluator.getCurrentModuleSync();
      const displayName = isCurrent 
        ? colorText(moduleName, colors.fg.green + colors.bright, useColors) + " (current)"
        : moduleName;
      console.log(`- ${displayName}`);
    });
    console.log("---------");
  }
}

// New command to switch modules
async function commandModule(evaluator: ModuleAwareEvaluator, state: ReplState, moduleName: string): Promise<void> {
  // Check if module name is provided
  if (!moduleName) {
    // If no module name is provided, show the current module
    console.log(colorText(`Current module: ${evaluator.getCurrentModuleSync()}`, 
                         colors.fg.sicpPurple + colors.bright, true));
    console.log(`The module name appears in your prompt: hql[${evaluator.getCurrentModuleSync()}]>`);
    console.log(`Use :module <n> to switch to a different module`);
    return;
  }
  
  try {
    // Switch to the specified module
    await evaluator.switchModule(moduleName);
    // Update REPL state
    state.currentModule = evaluator.getCurrentModuleSync();
    console.log(`Switched to module: ${moduleName}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error switching to module: ${errorMessage}`);
  }
}

// Command handler for :list command
async function commandList(evaluator: ModuleAwareEvaluator, useColors: boolean): Promise<void> {
  console.log(colorText("Symbols in current module:", colors.fg.sicpBlue + colors.bright, useColors));
  
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
    console.log(`To see details about a symbol: ${colorText(":see <symbol-name>", colors.fg.sicpGreen, useColors)}`);
  }
}

// Updated remove command with integrated reset functionality and colon syntax
async function commandRemove(evaluator: ModuleAwareEvaluator, args: string, useColors: boolean, state: ReplState): Promise<void> {
  if (!args || args.trim() === "") {
    console.error("No target specified. Use :remove <symbol>, :remove module:<n>, or :remove all");
    console.log("For more information, try :help remove");
    return;
  }
  
  const argText = args.trim();
  const availableModules = await evaluator.getAvailableModules();
  
  // Handle special "all" cases (previously handled by :reset)
  if (argText === "all") {
    // Remove everything (full reset)
    await confirmAndExecute(
      "Remove all modules and definitions? This will reset the entire environment.",
      () => {
        evaluator.resetEnvironment(false);
        state.currentModule = evaluator.getCurrentModuleSync();
        console.log(colorText("Environment completely reset.", colors.fg.green, useColors));
      },
      useColors
    );
    return;
  }
  
  if (argText === "all:symbols") {
    // Clear all definitions but keep module structure
    await confirmAndExecute(
      "Remove all symbols from all modules but preserve module structure?",
      () => {
        evaluator.resetEnvironment(true);
        state.currentModule = evaluator.getCurrentModuleSync();
        console.log(colorText("All symbols removed, module structure preserved.", colors.fg.green, useColors));
      },
      useColors
    );
    return;
  }
  
  if (argText === "all:modules") {
    // Remove all modules except current
    await confirmAndExecute(
      "Remove all modules except the current one?",
      () => {
        const currentModule = evaluator.getCurrentModuleSync();
        
        // We need to handle this asynchronously inside a sync function
        // Use an IIFE to handle this
        (async () => {
          const modules = await evaluator.getAvailableModules();
          
          // Remove each module except the current one
          let removedCount = 0;
          for (const moduleName of modules) {
            if (moduleName !== currentModule && moduleName !== "user") {
              if (await evaluator.removeModule(moduleName)) {
                removedCount++;
              }
            }
          }
          
          console.log(colorText(`Removed ${removedCount} modules. Kept '${currentModule}' as the current module.`, 
            colors.fg.green, useColors));
        })().catch(e => console.error(`Error removing modules: ${e}`));
      },
      useColors
    );
    return;
  }
  
  // Check if we're removing a specific module using colon syntax
  if (argText.startsWith("module:")) {
    const moduleName = argText.substring("module:".length);
    
    if (!moduleName) {
      console.error("No module name specified. Use :remove module:<n>");
      return;
    }
    
    // Validate module exists before asking for confirmation
    if (!availableModules.includes(moduleName)) {
      console.error(`Module '${moduleName}' does not exist.`);
      console.log(`Use :modules to see a list of available modules.`);
      return;
    }
    
    if (moduleName === "user") {
      console.error("The default 'user' module cannot be removed.");
      console.log("The 'user' module is the default module that exists when the REPL starts.");
      console.log("You can remove individual symbols from it using :remove <symbol>");
      return;
    }
    
    await confirmAndExecute(
      `Remove module '${moduleName}'? This will delete all symbols in this module.`,
      async () => {
        const removed = await evaluator.removeModule(moduleName);
        
        if (removed) {
          console.log(colorText(`Module '${moduleName}' has been removed.`, colors.fg.green, useColors));
          
          // If we removed the current module, update state
          if (state.currentModule === moduleName) {
            state.currentModule = evaluator.getCurrentModuleSync();
            console.log(colorText(`Switched to module: ${state.currentModule}`, colors.fg.cyan, useColors));
          }
        } else {
          console.error(`Failed to remove module '${moduleName}'. It may not exist or cannot be removed.`);
        }
      },
      useColors
    );
    return;
  }
  
  // Check for module:symbol syntax
  if (argText.includes(":")) {
    const [moduleName, symbolName] = argText.split(":");
    
    // Validate module exists before asking for confirmation
    if (!availableModules.includes(moduleName)) {
      console.error(`Module '${moduleName}' does not exist.`);
      if (moduleName === "all") {
        console.log(`If you meant to remove all modules, use :remove all:modules`);
        console.log(`If you meant to remove all symbols, use :remove all:symbols`);
      }
      console.log(`Use :modules to see a list of available modules.`);
      return;
    }
    
    if (!symbolName) {
      console.error("No symbol specified. Use :remove module:symbol");
      return;
    }
    
    // Verify symbol exists in module before asking for confirmation
    const moduleSymbols = await evaluator.listModuleSymbols(moduleName);
    if (!moduleSymbols.includes(symbolName)) {
      console.error(`Symbol '${symbolName}' not found in module '${moduleName}'.`);
      return;
    }
    
    await confirmAndExecute(
      `Remove symbol '${symbolName}' from module '${moduleName}'?`,
      async () => {
        const removed = await evaluator.removeSymbolFromModule(symbolName, moduleName);
        
        if (removed) {
          console.log(colorText(`Symbol '${symbolName}' has been removed from module '${moduleName}'.`, 
            colors.fg.green, useColors));
        } else {
          console.error(`Symbol '${symbolName}' not found in module '${moduleName}'.`);
        }
      },
      useColors
    );
    return;
  }
  
  // If we get here, it's a symbol name
  const symbolName = argText;
  
  // Check if the symbol name matches a module name - this is likely a mistake
  if (availableModules.includes(symbolName)) {
    // Special case for global module when trying to remove with `:remove global`
    if (symbolName === "global") {
      console.error(`Error: The default 'global' module cannot be removed.`);
      console.log(`The 'global' module is the fundamental module that exists when the REPL starts.`);
      console.log(`You can remove individual symbols from the global module with :remove <symbol-name>`);
      console.log(`You can use :remove all to reset all modules including global to a clean state.`);
      return;
    }
    
    console.error(`'${symbolName}' is a module name, not a symbol.`);
    console.log(`To remove a module, use :remove module:${symbolName}`);
    return;
  }
  
  // Check if symbol exists in current module before prompting
  const currentModule = evaluator.getCurrentModuleSync();
  const moduleSymbols = await evaluator.listModuleSymbols(currentModule);
  if (!moduleSymbols.includes(symbolName)) {
    console.error(`Symbol '${symbolName}' not found in module '${currentModule}'.`);
    
    // If it looks like they're trying to remove a module, offer guidance
    if (symbolName !== "user" && availableModules.some(m => m.includes(symbolName) || symbolName.includes(m))) {
      console.log(`If you're trying to remove a module, use :remove module:${symbolName}`);
    }
    
    return;
  }
  
  await confirmAndExecute(
    `Remove symbol '${symbolName}' from current module '${evaluator.getCurrentModuleSync()}'?`,
    () => {
      const removed = evaluator.removeSymbol(symbolName);
      
      if (removed) {
        console.log(colorText(`Symbol '${symbolName}' has been removed from module '${evaluator.getCurrentModuleSync()}'.`, 
          colors.fg.green, useColors));
      } else {
        console.error(`Symbol '${symbolName}' not found in module '${evaluator.getCurrentModuleSync()}'.`);
      }
    },
    useColors
  );
}

// Helper function for confirmation dialogs using Deno's API
async function confirmAndExecute(message: string, action: () => void | Promise<void>, useColors: boolean): Promise<void> {
  console.log(colorText(message, colors.fg.yellow, useColors));
  console.log("Type 'y' or 'yes' to confirm: ");
  
  // Use Deno's prompt for user input
  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);
  
  if (n) {
    const answer = new TextDecoder().decode(buf.subarray(0, n)).trim().toLowerCase();
    
    if (answer === "yes" || answer === "y") {
      await action();
    } else {
      console.log("Operation cancelled.");
    }
  } else {
    console.log("Operation cancelled.");
  }
}

// Helper for applying error suggestions
function commandDefault(cmd: string): void {
  console.error(`Unknown command: ${cmd}`);
  console.log("Use :help to see available commands");
}

function commandVerbose(logger: Logger, setVerbose: (val: boolean) => void): void {
  const newValue = !logger.isVerbose;
  setVerbose(newValue);
  console.log(`Verbose mode ${newValue ? "enabled" : "disabled"}`);
}

function commandAst(showAst: boolean, setShowAst: (val: boolean) => void): void {
  const newValue = !showAst;
  setShowAst(newValue);
  console.log(`AST display ${newValue ? "enabled" : "disabled"}`);
}

function commandExpanded(showExpanded: boolean, setShowExpanded: (val: boolean) => void): void {
  const newValue = !showExpanded;
  setShowExpanded(newValue);
  console.log(`Expanded form display ${newValue ? "enabled" : "disabled"}`);
}

function commandJs(showJs: boolean, setShowJs: (val: boolean) => void): void {
  const newValue = !showJs;
  setShowJs(newValue);
  console.log(`JavaScript code display ${newValue ? "enabled" : "disabled"}`);
}

// Helper for formatting source code in output
// Added to standardize code display formats across the REPL
function formatSourceCode(source: string): string {
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

// Helper function to convert from user-facing hyphenated names to internal underscore names
function toInternalName(name: string): string {
  return name.replace(/-/g, '_');
}

// Helper function to convert from internal underscore names to user-facing hyphenated names
function toUserFacingName(name: string): string {
  return name.replace(/_/g, '-');
}

// Command handler for :see command
async function commandSee(evaluator: ModuleAwareEvaluator, args: string, useColors: boolean, showJs: boolean = false): Promise<void> {
  // First get the ACTUAL current module directly from the evaluator
  // This should always return the true current module - using sync since evaluator is already initialized
  const currentModule = evaluator.getCurrentModuleSync();
  
  // Parse the arguments to determine what to show
  if (!args || args.trim() === "") {
    // :see - Show all information for the current module
    console.log(colorText(`Current Module: ${currentModule}`, colors.fg.sicpPurple + colors.bright, useColors));
    console.log(colorText("─".repeat(60), colors.fg.white, useColors));
    
    const symbols = await evaluator.listModuleSymbols(currentModule);
    const exports = await evaluator.getModuleExports(currentModule);
    
    if (symbols.length === 0) {
      console.log("This module contains no symbols.");
      return;
    }
    
    // Show the module details using the retrieved module name
    await showModuleSymbols(evaluator, currentModule, symbols, exports, useColors, showJs);
    return;
  }
  
  const argsText = args.trim();
  
  // Special cases for "all" commands
  if (argsText === "all") {
    // :see all - Show all information across all modules
    await showAllModulesDetails(evaluator, useColors, showJs);
    return;
  }
  
  if (argsText === "all:modules") {
    // :see all:modules - Show all module names
    await showAllModuleNames(evaluator, useColors);
    return;
  }
  
  if (argsText === "all:symbols") {
    // :see all:symbols - Show all symbols across all modules
    await showAllSymbols(evaluator, useColors, showJs);
    return;
  }
  
  if (argsText === "exports") {
    // :see exports - Show all exports from the current module
    await showModuleExports(evaluator, currentModule, useColors);
    return;
  }
  
  // Check if it's using module:symbol or module:exports format
  if (argsText.includes(':')) {
    const [moduleName, specifier] = argsText.split(':');
    
    const availableModules = await evaluator.getAvailableModules();
    if (!availableModules.includes(moduleName)) {
      console.error(`Module '${moduleName}' not found.`);
      console.log(`Available modules: ${availableModules.join(', ')}`);
      return;
    }
    
    if (specifier === "exports") {
      // :see module:exports - Show exports from a specific module
      await showModuleExports(evaluator, moduleName, useColors);
      return;
    }
    
    // :see module:symbol - Show a specific symbol from a module
    const userSymbolName = specifier.trim();
    const internalSymbolName = toInternalName(userSymbolName);
    
    // Try both the user-provided name and the internal name
    let definition = await evaluator.getSymbolDefinition(userSymbolName, moduleName);
    
    if (!definition) {
      definition = await evaluator.getSymbolDefinition(internalSymbolName, moduleName);
    }
    
    if (!definition) {
      console.error(`Symbol '${userSymbolName}' not found in module '${moduleName}'.`);
      return;
    }
    
    // Use the user's original symbol name for display
    await showSymbolDefinition(evaluator, userSymbolName, moduleName, definition, useColors, showJs);
    return;
  }
  
  // Check if it's a module name
  const availableModules = await evaluator.getAvailableModules();
  if (availableModules.includes(argsText)) {
    // :see module-name - Show all information for a specific module
    await showModuleDetails(evaluator, argsText, useColors, showJs);
    return;
  }
  
  // Otherwise it's likely a symbol in the current module
  const userSymbolName = argsText;
  const internalSymbolName = toInternalName(userSymbolName);
  
  // Try to look up the symbol using both the user-provided name and the internal name
  let definition = await evaluator.getSymbolDefinition(userSymbolName, currentModule);
  
  // If not found with original name, try with converted name
  if (!definition) {
    definition = await evaluator.getSymbolDefinition(internalSymbolName, currentModule);
  }
  
  if (!definition) {
    console.error(`Symbol '${userSymbolName}' not found in current module '${currentModule}'.`);
    const moduleSymbols = await evaluator.listModuleSymbols(currentModule);
    
    // Convert internal names to user-facing names for display
    const userFacingSymbols = moduleSymbols.map(toUserFacingName);
    
    console.log(`Available symbols in module '${currentModule}': ${userFacingSymbols.join(', ')}`);
    return;
  }
  
  // :see symbol-name - Show a specific symbol from current module
  // Pass the user-provided name for display purposes, even if we found it via internal name
  await showSymbolDefinition(evaluator, userSymbolName, currentModule, definition, useColors, showJs);
}

// Helper function to show module symbols 
async function showModuleSymbols(
  evaluator: ModuleAwareEvaluator, 
  moduleName: string, 
  symbols: string[], 
  exports: string[], 
  useColors: boolean, 
  showJs: boolean
): Promise<void> {
  // Categorize symbols by type
  const functionSymbols: string[] = [];
  const variableSymbols: string[] = [];
  const otherSymbols: string[] = [];
  
  // Convert all symbols to user-facing format for display
  const userFacingSymbols = symbols.map(toUserFacingName);
  const userFacingExports = exports.map(toUserFacingName);
  
  // Convert user symbols back to internal format for definition lookup
  for (const userSymbol of userFacingSymbols) {
    const internalSymbol = toInternalName(userSymbol);
    // Use the original symbol from the array if it exists there, otherwise use the converted one
    const lookupSymbol = symbols.includes(userSymbol) ? userSymbol : internalSymbol;
    
    const definition = await evaluator.getSymbolDefinition(lookupSymbol, moduleName);
    if (definition) {
      // Check metadata.type first, which is more reliable
      if (definition.metadata && definition.metadata.type === "functions") {
        functionSymbols.push(userSymbol);
      } else if (typeof definition.value === 'function') {
        // Fallback to checking the value type
        functionSymbols.push(userSymbol);
      } else {
        variableSymbols.push(userSymbol);
      }
    } else {
      otherSymbols.push(userSymbol);
    }
  }
  
  // Create set of exported symbols for easy lookup
  const exportSet = new Set(userFacingExports);
  
  // Display functions
  if (functionSymbols.length > 0) {
    console.log(colorText("Functions:", colors.fg.sicpGreen + colors.bright, useColors));
    console.log("------------");
    functionSymbols.sort().forEach(symbol => {
      const isExported = exportSet.has(symbol);
      const marker = isExported ? colorText(' (exported)', colors.fg.green, useColors) : '';
      console.log(`- ${symbol}${marker}`);
    });
  }
  
  // Display variables
  if (variableSymbols.length > 0) {
    if (functionSymbols.length > 0) console.log("");
    console.log(colorText("Variables:", colors.fg.sicpBlue + colors.bright, useColors));
    console.log("------------");
    variableSymbols.sort().forEach(symbol => {
      const isExported = exportSet.has(symbol);
      const marker = isExported ? colorText(' (exported)', colors.fg.green, useColors) : '';
      console.log(`- ${symbol}${marker}`);
    });
  }
  
  // Display other symbols if any
  if (otherSymbols.length > 0) {
    if (functionSymbols.length > 0 || variableSymbols.length > 0) console.log("");
    console.log(colorText("Other Symbols:", colors.fg.yellow + colors.bright, useColors));
    console.log("------------");
    otherSymbols.sort().forEach(symbol => {
      const isExported = exportSet.has(symbol);
      const marker = isExported ? colorText(' (exported)', colors.fg.green, useColors) : '';
      console.log(`- ${symbol}${marker}`);
    });
  }
  
  // Show summary of exports if any
  if (exports.length > 0) {
    console.log(colorText("\nExports Summary:", colors.fg.lightGreen + colors.bright, useColors));
    console.log("------------");
    console.log(colorText(exports.join(", "), colors.fg.green, useColors));
  }
  
  console.log("\nUsage:");
  console.log(`To see a specific symbol: :see ${moduleName}:<symbol-name>`);
  console.log(`To see only exports: :see ${moduleName}:exports`);
  if (moduleName !== evaluator.getCurrentModuleSync()) {
    console.log(`To use symbols from this module: (import [symbol1, symbol2] from "${moduleName}")`);
  }
}

// Helper function to show all details about a specific module
async function showModuleDetails(evaluator: ModuleAwareEvaluator, moduleName: string, useColors: boolean, showJs: boolean): Promise<void> {
  // Important: Use the passed moduleName directly, don't fetch it again from the evaluator
  // This avoids potential inconsistencies in module state
  
  const currentModule = evaluator.getCurrentModuleSync();
  const isCurrentModule = moduleName === currentModule;
  
  const symbols = await evaluator.listModuleSymbols(moduleName);
  const exports = await evaluator.getModuleExports(moduleName);
  
  // Show module header with clear indication
  if (isCurrentModule) {
    console.log(colorText(`Current Module: ${moduleName}`, colors.fg.sicpPurple + colors.bright, useColors));
  } else {
    console.log(colorText(`Module: ${moduleName}`, colors.fg.sicpPurple + colors.bright, useColors));
  }
  console.log(colorText("─".repeat(60), colors.fg.white, useColors));
  
  if (symbols.length === 0) {
    console.log("This module contains no symbols.");
    return;
  }
  
  // Use the shared function to display module symbols
  await showModuleSymbols(evaluator, moduleName, symbols, exports, useColors, showJs);
}

// Helper function to show information about all modules
async function showAllModulesDetails(evaluator: ModuleAwareEvaluator, useColors: boolean, showJs: boolean): Promise<void> {
  const modules = await evaluator.getAvailableModules();
  const currentModule = evaluator.getCurrentModuleSync();
  
  console.log(colorText("System-wide Information (All Modules):", colors.fg.sicpRed + colors.bright, useColors));
  console.log(colorText("─".repeat(60), colors.fg.white, useColors));
  
  if (modules.length === 0) {
    console.log("No modules defined in the system.");
    return;
  }
  
  for (const moduleName of modules) {
    const symbolList = await evaluator.listModuleSymbols(moduleName);
    const exportList = await evaluator.getModuleExports(moduleName);
    const symbolCount = symbolList.length;
    const exportCount = exportList.length;
    const isCurrent = moduleName === currentModule;
    
    const prefix = isCurrent ? "* " : "  ";
    const currentTag = isCurrent ? colorText(" (current)", colors.fg.cyan, useColors) : "";
    
    console.log(`${prefix}${colorText(moduleName, colors.fg.sicpPurple + colors.bright, useColors)}${currentTag} - ${symbolCount} symbols, ${exportCount} exports`);
  }
  
  console.log(colorText("─".repeat(60), colors.fg.white, useColors));
  console.log("* Current module");
  
  console.log("\nUsage:");
  console.log("To see a specific module: :see <module-name>");
  console.log("To see only module names: :see all:modules");
  console.log("To see all symbols across all modules: :see all:symbols");
}

// Helper function to show only module names
async function showAllModuleNames(evaluator: ModuleAwareEvaluator, useColors: boolean): Promise<void> {
  console.log(colorText("All available modules:", colors.fg.sicpRed + colors.bright, useColors));
  
  const modules = await evaluator.getAvailableModules();
  
  if (modules.length === 0) {
    console.log("No modules defined");
    return;
  }
  
  console.log("Module names:");
  console.log("-------------");
  modules.forEach(moduleName => {
    console.log(`- ${moduleName}`);
  });
  console.log("-------------");
  console.log(`Total: ${modules.length} modules`);
}

// Helper function to show all symbols across all modules
async function showAllSymbols(evaluator: ModuleAwareEvaluator, useColors: boolean, showJs: boolean): Promise<void> {
  console.log(colorText("All symbols across all modules:", colors.fg.sicpRed + colors.bright, useColors));
  
  const modules = await evaluator.getAvailableModules();
  
  if (modules.length === 0) {
    console.log("No modules defined");
    return;
  }
  
  let totalSymbols = 0;
  
  // Sort modules alphabetically
  modules.sort();
  
  for (const moduleName of modules) {
    const symbols = await evaluator.listModuleSymbols(moduleName);
    
    if (symbols.length > 0) {
      console.log(`\n${colorText(`Module: ${moduleName}`, colors.fg.sicpPurple, useColors)}`);
      console.log("-".repeat(moduleName.length + 8));
      
      for (const symbolName of symbols) {
        console.log(`- ${symbolName}`);
        totalSymbols++;
      }
    }
  }
  
  console.log(`\nTotal: ${totalSymbols} symbols in ${modules.length} modules`);
  
  console.log("\nUse :see <module>:<symbol> to examine a specific symbol");
  console.log("Use :see <module> to see detailed info about a module");
}

// Helper function to show exports from a module
function showModuleExports(evaluator: ModuleAwareEvaluator, moduleName: string, useColors: boolean): void {
  console.log(colorText("Module Exports:", colors.fg.sicpGreen + colors.bright, useColors));
  
  const exports = evaluator.getModuleExports(moduleName);
  
  const isCurrentModule = moduleName === evaluator.getCurrentModuleSync();
  const title = isCurrentModule ? 
    `Exports from Current Module (${moduleName}):` : 
    `Exports from Module '${moduleName}':`;
  
  console.log(colorText(title, colors.fg.lightGreen, useColors));
  console.log(colorText("─".repeat(60), colors.fg.white, useColors));
  
  // Make this function async and immediately invoke it
  (async () => {
    const exportList = await exports;
    
    if (exportList.length === 0) {
      console.log(`No symbols exported from module '${moduleName}'.`);
      return;
    }
    
    console.log("Exported symbols:");
    console.log("------------");
    
    const sortedExports = [...exportList].sort();
    for (const symbol of sortedExports) {
      const definition = await evaluator.getSymbolDefinition(symbol, moduleName);
      
      let typeInfo = "unknown";
      if (definition) {
        if (typeof definition.value === 'function') {
          typeInfo = "function";
        } else {
          typeInfo = "variable";
        }
      }
      
      console.log(`- ${symbol} (${typeInfo})`);
    }
    
    console.log("\nUsage:");
    console.log(`To import these symbols: (import [${exportList.length > 0 ? exportList[0] + ", ..." : "symbol"}] from "${moduleName}")`);
    console.log(`To see a specific symbol definition: :see ${moduleName}:<symbol-name>`);
  })();
}

// Helper function to show a symbol definition
async function showSymbolDefinition(
  evaluator: ModuleAwareEvaluator,
  symbolName: string, 
  moduleName: string, 
  definition: any, 
  useColors: boolean, 
  showJs: boolean
): Promise<void> {
  const currentModule = evaluator.getCurrentModuleSync();
  const isCurrentModule = moduleName === currentModule;
  const title = isCurrentModule ? 
    `Definition of '${symbolName}' in current module:` : 
    `Definition of '${moduleName}:${symbolName}':`;
  
  console.log(colorText(title, colors.fg.sicpRed + colors.bright, useColors));
  console.log("----------------");
  
  // Determine if this is a function or a variable
  const isFunction = typeof definition.value === 'function';
  
  // For variables, always show the actual value first
  if (!isFunction) {
    console.log(colorText("Value:", colors.fg.sicpBlue, useColors));
    console.log(formatValue(definition.value));
    console.log("");
  }
  
  // Display the source code - prefer HQL source over JS
  if (definition.source) {
    console.log(colorText("HQL Source:", colors.fg.sicpGreen, useColors));
    console.log(formatSourceCode(definition.source));
  }
  
  // Only show the JS source if specifically enabled
  if (definition.jsSource && showJs) {
    console.log(colorText("\nJavaScript Transpilation:", colors.fg.yellow, useColors));
    console.log(definition.jsSource);
  }
  
  // Show value if no source is available for functions
  if (!definition.source && !definition.jsSource && isFunction) {
    console.log(colorText("Function:", colors.fg.sicpGreen, useColors));
    console.log(definition.value.toString());
  }
  
  // Show metadata if available - include the full source in the metadata
  if (definition.metadata) {
    console.log(colorText("\nMetadata:", colors.fg.lightBlue, useColors));
    console.log(definition.metadata);
  }
  
  console.log("----------------");
  
  // Show export status
  if (definition.exports) {
    const isExported = definition.exports.includes(symbolName);
    if (isExported) {
      console.log(colorText("This symbol is exported from its module.", colors.fg.green, useColors));
    } else {
      console.log(colorText("This symbol is not exported from its module.", colors.fg.yellow, useColors));
    }
  }
  
  if (!isCurrentModule) {
    console.log("\nTo use this symbol in HQL, import it with:");
    console.log(`(import [${symbolName}] from "${moduleName}")`);
  }
  
  console.log("----------------");
}

/* ─────────────────────────────────────────────────────────────────────────────
   REPL Input Handling Helpers
───────────────────────────────────────────────────────────────────────────── */
// We now return an object indicating if the input was obtained via history navigation.
interface ReadLineResult {
  text: string;
  fromHistory: boolean;
  controlD: boolean;
  indent?: string;
}

/**
 * Checks if a line needs auto-indentation based on the previous line
 */
function needsIndentation(previousLine: string): boolean {
  // Check if previous line ends with opening brackets or other indicators
  const openingTokens = ["{", "[", "(", "->", "=>", "do", "then", "else"];
  const trimmed = previousLine.trim();
  
  if (trimmed.length === 0) return false;
  
  // Check for typical functional constructs that need indentation
  const functionalConstructs = [
    /\(\s*fn\s+[^)]*$/,                  // (fn name
    /\(\s*defn\s+[^)]*$/,                // (defn name
    /\(\s*let\s+[^)]*$/,                 // (let [bindings]
    /\(\s*if\s+[^)]*$/,                  // (if condition
    /\(\s*when\s+[^)]*$/,                // (when condition
    /\(\s*cond\s*$/,                     // (cond
    /\(\s*case\s+[^)]*$/,                // (case value
    /\(\s*map\s+[^)]*$/,                 // (map func
    /\(\s*filter\s+[^)]*$/,              // (filter pred
    /\(\s*reduce\s+[^)]*$/,              // (reduce func
    /\(\s*for\s+[^)]*$/,                 // (for [bindings]
    /\(\s*loop\s+[^)]*$/,                // (loop [bindings]
    /\(\s*doseq\s+[^)]*$/,               // (doseq [bindings]
    /\(\s*import\s+[^)]*$/,              // (import [...] from
    /\(\s*export\s+[^)]*$/,              // (export [...])
    /\[\s*[^]]*$/,                       // [ not closed
    /\{\s*[^}]*$/                        // { not closed
  ];
  
  // Check for opening bracket at the end
  for (const token of openingTokens) {
    if (trimmed.endsWith(token)) {
      return true;
    }
  }
  
  // Check for functional constructs
  for (const pattern of functionalConstructs) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  
  // Check if we're in the middle of an unclosed bracket
  const balanceResult = getUnbalancedBrackets(previousLine);
  return balanceResult.openCount > balanceResult.closeCount;
}

/**
 * Calculate proper indentation level based on the previous lines
 */
function calculateIndentation(lines: string[], lineIndex: number, defaultIndent = 2): string {
  if (lineIndex <= 0) return "";
  
  const currentLine = lines[lineIndex].trimLeft();
  const previousLine = lines[lineIndex - 1];
  
  // Get base indentation from the previous line
  const previousIndent = getIndentation(previousLine);
  
  // Check for dedenting patterns (closing brackets)
  if (currentLine.startsWith(")") || 
      currentLine.startsWith("]") || 
      currentLine.startsWith("}")) {
    // Dedent one level
    return previousIndent.slice(0, Math.max(0, previousIndent.length - defaultIndent));
  }
  
  // Check if previous line should trigger an indent
  if (needsIndentation(previousLine)) {
    return previousIndent + " ".repeat(defaultIndent);
  }
  
  // Otherwise, maintain the same indentation
  return previousIndent;
}

/**
 * Extract indentation string from a line
 */
function getIndentation(line: string): string {
  const match = line.match(/^(\s*)/);
  return match ? match[1] : "";
}

/**
 * Get detailed information about bracket balance in a string
 */
function getUnbalancedBrackets(text: string): { 
  openCount: number; 
  closeCount: number; 
  balance: number;
  lastOpenType?: string;
  lastCloseType?: string;
  bracketStack: string[];
} {
  const result = {
    openCount: 0,
    closeCount: 0,
    balance: 0,
    lastOpenType: undefined as string | undefined,
    lastCloseType: undefined as string | undefined,
    bracketStack: [] as string[]
  };
  
  const openBrackets = ["(", "[", "{"];
  const closeBrackets = [")", "]", "}"];
  const bracketPairs: Record<string, string> = {
    "(": ")",
    "[": "]",
    "{": "}"
  };
  
  // Skip content in string literals
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Handle string literals
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    
    if (inString) {
      if (char === '\\') {
        escapeNext = !escapeNext;
      } else {
        escapeNext = false;
      }
      continue;
    }
    
    // Process brackets
    if (openBrackets.includes(char)) {
      result.openCount++;
      result.balance++;
      result.lastOpenType = char;
      result.bracketStack.push(char);
    } else if (closeBrackets.includes(char)) {
      result.closeCount++;
      result.balance--;
      result.lastCloseType = char;
      
      // Check if this is a matching close bracket
      const lastOpen = result.bracketStack.pop();
      if (lastOpen && bracketPairs[lastOpen] !== char) {
        // Mismatched brackets
        result.lastCloseType = `mismatched:${char}`;
      }
    }
  }
  
  return result;
}

/**
 * Get suggestion for fixing unbalanced brackets
 */
function getSuggestedClosing(bracketStack: string[]): string {
  if (bracketStack.length === 0) return "";
  
  const bracketPairs: Record<string, string> = {
    "(": ")",
    "[": "]",
    "{": "}"
  };
  
  // Build closing sequence in reverse order
  return bracketStack
    .map(bracket => bracketPairs[bracket] || "")
    .reverse()
    .join("");
}

// Update existing readLineWithHistory function with enhanced bracket tracking
async function readLineWithHistory(
  prompt: string, 
  history: string[], 
  state: ReplState,
  tabCompletion?: TabCompletion
): Promise<ReadLineResult> {
  // ... existing code ...

  // Enhanced getIndentation function
  const getIndentation = (): string => {
    let baseIndent = "";
    
    // Adjust indentation based on line content for multiline mode
    if (state.multilineMode && state.multilineInput) {
      const lines = state.multilineInput.split("\n");
      const newLineIndex = lines.length;
      baseIndent = calculateIndentation(lines, newLineIndex);
    }
    
    return baseIndent;
  };

  // ... existing code ...
  
  // Enhanced balance tracking
  const updateBalanceTracking = (line: string): void => {
    if (!state.multilineMode) {
      const balanceResult = getUnbalancedBrackets(line);
      state.parenBalance = balanceResult.balance;
      state.bracketStack = balanceResult.bracketStack;
    } else {
      // For multiline mode, track balance across all content
      const balanceResult = getUnbalancedBrackets(state.multilineInput + "\n" + line);
      state.parenBalance = balanceResult.balance;
      state.bracketStack = balanceResult.bracketStack;
    }
  };
  
  // ... existing code ...
  
  // Handle bracket auto-closing
  const handleBracketAutoclosing = (input: string, key: Deno.Key): boolean => {
    // Implement bracket auto-closing based on previous character
    const bracketPairs: Record<string, string> = {
      "(": ")",
      "[": "]",
      "{": "}"
    };
    
    if (key.sequence && bracketPairs[key.sequence]) {
      const closing = bracketPairs[key.sequence];
      const cursorPos = input.length + key.sequence.length;
      
      // Auto-insert closing bracket and position cursor between them
      const newInput = input + key.sequence + closing;
      Deno.stdout.writeSync(new TextEncoder().encode(key.sequence + closing));
      
      // Move cursor back one position
      Deno.stdout.writeSync(new TextEncoder().encode("\x1b[1D"));
      
      return true;
    }
    
    return false;
  };
  
  // ... rest of the function ...
}

/* ─────────────────────────────────────────────────────────────────────────────
   Module Management Improvements
───────────────────────────────────────────────────────────────────────────── */

/**
 * Module Dependencies Tracker
 * Manages module dependencies and provides quick import suggestions
 */
class ModuleDependencyTracker {
  private evaluator: ModuleAwareEvaluator;
  private dependencies: Map<string, Set<string>> = new Map();
  private dependents: Map<string, Set<string>> = new Map();
  private moduleDescriptions: Map<string, string> = new Map();
  
  constructor(evaluator: ModuleAwareEvaluator) {
    this.evaluator = evaluator;
  }
  
  /**
   * Register a dependency between modules
   */
  addDependency(fromModule: string, toModule: string): void {
    // Get or create the dependencies set for the fromModule
    if (!this.dependencies.has(fromModule)) {
      this.dependencies.set(fromModule, new Set());
    }
    this.dependencies.get(fromModule)!.add(toModule);
    
    // Get or create the dependents set for the toModule
    if (!this.dependents.has(toModule)) {
      this.dependents.set(toModule, new Set());
    }
    this.dependents.get(toModule)!.add(fromModule);
  }
  
  /**
   * Remove a dependency between modules
   */
  removeDependency(fromModule: string, toModule: string): void {
    if (this.dependencies.has(fromModule)) {
      this.dependencies.get(fromModule)!.delete(toModule);
    }
    
    if (this.dependents.has(toModule)) {
      this.dependents.get(toModule)!.delete(fromModule);
    }
  }
  
  /**
   * Get all modules that the given module depends on
   */
  getDependencies(moduleName: string): string[] {
    return Array.from(this.dependencies.get(moduleName) || []);
  }
  
  /**
   * Get all modules that depend on the given module
   */
  getDependents(moduleName: string): string[] {
    return Array.from(this.dependents.get(moduleName) || []);
  }
  
  /**
   * Set a description for a module
   */
  setModuleDescription(moduleName: string, description: string): void {
    this.moduleDescriptions.set(moduleName, description);
  }
  
  /**
   * Get the description for a module
   */
  getModuleDescription(moduleName: string): string {
    return this.moduleDescriptions.get(moduleName) || "No description available";
  }
  
  /**
   * Check if a change to a module would break dependents
   */
  async checkForBreakingChanges(moduleName: string, removedSymbols: string[]): Promise<Map<string, string[]>> {
    const dependents = this.getDependents(moduleName);
    const breakingChanges = new Map<string, string[]>();
    
    for (const dependent of dependents) {
      const affectedSymbols: string[] = [];
      
      // Check each symbol being removed to see if it's imported by the dependent
      for (const symbol of removedSymbols) {
        const isImported = await this.isSymbolImportedBy(symbol, moduleName, dependent);
        if (isImported) {
          affectedSymbols.push(symbol);
        }
      }
      
      if (affectedSymbols.length > 0) {
        breakingChanges.set(dependent, affectedSymbols);
      }
    }
    
    return breakingChanges;
  }
  
  /**
   * Check if a specific symbol is imported by another module
   */
  private async isSymbolImportedBy(symbolName: string, fromModule: string, toModule: string): Promise<boolean> {
    // This implementation will depend on how imports are tracked in your system
    // For now, return false to avoid breaking anything
    return false;
  }
  
  /**
   * Generate import suggestions based on what's being used
   */
  async generateImportSuggestions(code: string, currentModule: string): Promise<Map<string, string[]>> {
    const suggestions = new Map<string, string[]>();
    
    // Extract symbols used in the code
    const symbols = this.extractSymbolsFromCode(code);
    
    // For each symbol, check if it exists in other modules
    for (const symbol of symbols) {
      const modulesWithSymbol = await this.findModulesWithSymbol(symbol, currentModule);
      
      for (const module of modulesWithSymbol) {
        if (!suggestions.has(module)) {
          suggestions.set(module, []);
        }
        suggestions.get(module)!.push(symbol);
      }
    }
    
    return suggestions;
  }
  
  /**
   * Extract symbol references from code
   */
  private extractSymbolsFromCode(code: string): string[] {
    // This is a simple implementation - a more robust one would parse the code
    const symbolRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$-]*\b/g;
    const matches = code.match(symbolRegex) || [];
    
    // Filter out duplicates and keywords
    const keywords = ["def", "defn", "fn", "if", "let", "do", "when", "while", "loop", 
                     "for", "import", "export", "module", "true", "false", "nil"];
    
    return [...new Set(matches)].filter(symbol => !keywords.includes(symbol));
  }
  
  /**
   * Find all modules that contain a given symbol
   */
  private async findModulesWithSymbol(symbolName: string, currentModule: string): Promise<string[]> {
    const modules = await this.evaluator.getAvailableModules();
    const result: string[] = [];
    
    for (const module of modules) {
      if (module === currentModule) continue;
      
      const symbols = await this.evaluator.listModuleSymbols(module);
      if (symbols.includes(symbolName)) {
        result.push(module);
      }
    }
    
    return result;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Interactive Documentation
───────────────────────────────────────────────────────────────────────────── */

/**
 * Documentation Manager
 * Provides access to documentation for HQL functions and modules
 */
class DocumentationManager {
  private evaluator: ModuleAwareEvaluator;
  private functionDocs: Map<string, string> = new Map();
  private builtinDocs: Map<string, string> = new Map();
  
  constructor(evaluator: ModuleAwareEvaluator) {
    this.evaluator = evaluator;
    this.initializeBuiltinDocs();
  }
  
  /**
   * Set documentation for a function
   */
  setFunctionDocumentation(moduleName: string, functionName: string, docString: string): void {
    const key = `${moduleName}:${functionName}`;
    this.functionDocs.set(key, docString);
  }
  
  /**
   * Get documentation for a function
   */
  getFunctionDocumentation(moduleName: string, functionName: string): string | undefined {
    const key = `${moduleName}:${functionName}`;
    return this.functionDocs.get(key) || this.builtinDocs.get(functionName);
  }
  
  /**
   * Extract docstring from function definition
   */
  extractDocstring(functionCode: string): string {
    // Match docstring comments at the start of a function or after the function name and args
    const docCommentRegex = /;;\s*(.+)$/gm;
    const docStrings: string[] = [];
    
    let match;
    while ((match = docCommentRegex.exec(functionCode)) !== null) {
      docStrings.push(match[1]);
    }
    
    return docStrings.join('\n');
  }
  
  /**
   * Initialize built-in function documentation
   */
  private initializeBuiltinDocs(): void {
    // Basic arithmetic functions
    this.builtinDocs.set("+", "Adds numbers or concatenates strings/lists.\nUsage: (+ x y z ...)");
    this.builtinDocs.set("-", "Subtracts numbers.\nUsage: (- x y z ...) or (- x) for negation");
    this.builtinDocs.set("*", "Multiplies numbers.\nUsage: (* x y z ...)");
    this.builtinDocs.set("/", "Divides numbers.\nUsage: (/ x y z ...)");
    
    // Comparison functions
    this.builtinDocs.set("=", "Tests if values are equal.\nUsage: (= x y z ...)");
    this.builtinDocs.set("<", "Tests if values are in ascending order.\nUsage: (< x y z ...)");
    this.builtinDocs.set(">", "Tests if values are in descending order.\nUsage: (> x y z ...)");
    this.builtinDocs.set("<=", "Tests if values are in non-descending order.\nUsage: (<= x y z ...)");
    this.builtinDocs.set(">=", "Tests if values are in non-ascending order.\nUsage: (>= x y z ...)");
    
    // Logic functions
    this.builtinDocs.set("and", "Logical AND operation.\nUsage: (and expr1 expr2 ...)");
    this.builtinDocs.set("or", "Logical OR operation.\nUsage: (or expr1 expr2 ...)");
    this.builtinDocs.set("not", "Logical NOT operation.\nUsage: (not expr)");
    
    // Control flow
    this.builtinDocs.set("if", "Conditional expression.\nUsage: (if condition then-expr else-expr)");
    this.builtinDocs.set("when", "Executes body when condition is true.\nUsage: (when condition body ...)");
    this.builtinDocs.set("cond", "Multi-way conditional.\nUsage: (cond [test1 expr1] [test2 expr2] ...)");
    this.builtinDocs.set("do", "Evaluates expressions in sequence.\nUsage: (do expr1 expr2 ...)");
    
    // Definitions
    this.builtinDocs.set("def", "Defines a global variable.\nUsage: (def name value)");
    this.builtinDocs.set("fn", "Defines a function.\nUsage: (fn name [params] body)");
    this.builtinDocs.set("defn", "Shorthand to define a named function.\nUsage: (defn name [params] body)");
    this.builtinDocs.set("let", "Creates local bindings.\nUsage: (let [name1 val1, name2 val2] body ...)");
    
    // Sequence functions
    this.builtinDocs.set("map", "Applies function to items in collection.\nUsage: (map f coll)");
    this.builtinDocs.set("filter", "Filters collection by predicate.\nUsage: (filter pred coll)");
    this.builtinDocs.set("reduce", "Combines collection elements with a function.\nUsage: (reduce f init coll)");
    
    // Module system
    this.builtinDocs.set("import", "Imports symbols from modules.\nUsage: (import [symbol1, symbol2] from \"module\")");
    this.builtinDocs.set("export", "Exports symbols from current module.\nUsage: (export [symbol1, symbol2])");
    
    // Data structure operations
    this.builtinDocs.set("get", "Gets value at key/index.\nUsage: (get collection key-or-index)");
    this.builtinDocs.set("contains?", "Tests if collection contains value.\nUsage: (contains? collection value)");
    this.builtinDocs.set("nth", "Gets value at index.\nUsage: (nth collection index)");
    this.builtinDocs.set("first", "Gets first item in collection.\nUsage: (first collection)");
    this.builtinDocs.set("rest", "Gets all but first item.\nUsage: (rest collection)");
    this.builtinDocs.set("cons", "Prepends item to collection.\nUsage: (cons item collection)");
    
    // Type inspection
    this.builtinDocs.set("type", "Returns type of value.\nUsage: (type value)");
    this.builtinDocs.set("str", "Converts values to string.\nUsage: (str val1 val2 ...)");
    this.builtinDocs.set("name", "Gets name of symbol or keyword.\nUsage: (name symbol-or-keyword)");
  }
  
  /**
   * Get documentation for a built-in HQL function
   */
  getBuiltinDocumentation(funcName: string): string | undefined {
    return this.builtinDocs.get(funcName);
  }
  
  /**
   * Display context-sensitive help for the current code
   */
  async getContextSensitiveHelp(code: string, position: number): Promise<string | undefined> {
    // Extract the symbol at the current position
    const symbolAtCursor = this.extractSymbolAtPosition(code, position);
    if (!symbolAtCursor) return undefined;
    
    // Try to find documentation for the symbol
    const currentModule = this.evaluator.getCurrentModuleSync();
    
    // First check if it's a built-in function
    const builtinDoc = this.getBuiltinDocumentation(symbolAtCursor);
    if (builtinDoc) return builtinDoc;
    
    // Then check user-defined functions
    const modules = await this.evaluator.getAvailableModules();
    
    // First check the current module
    const currentModuleDoc = this.getFunctionDocumentation(currentModule, symbolAtCursor);
    if (currentModuleDoc) return currentModuleDoc;
    
    // Then check other modules
    for (const module of modules) {
      if (module === currentModule) continue;
      
      const symbols = await this.evaluator.listModuleSymbols(module);
      if (symbols.includes(symbolAtCursor)) {
        const doc = this.getFunctionDocumentation(module, symbolAtCursor);
        if (doc) return `From module '${module}':\n${doc}`;
        
        // If no explicit doc is found, return a basic message that the symbol exists in this module
        return `Symbol '${symbolAtCursor}' exists in module '${module}'.\nUse (import [${symbolAtCursor}] from "${module}") to import it.`;
      }
    }
    
    return undefined;
  }
  
  /**
   * Extract the symbol at the current cursor position
   */
  private extractSymbolAtPosition(code: string, position: number): string | undefined {
    // Simple extraction: find word boundaries around position
    const beforeCursor = code.substring(0, position);
    const afterCursor = code.substring(position);
    
    const beforeMatch = beforeCursor.match(/[a-zA-Z0-9_$-]*$/);
    const afterMatch = afterCursor.match(/^[a-zA-Z0-9_$-]*/);
    
    if (!beforeMatch) return undefined;
    
    const symbol = beforeMatch[0] + (afterMatch ? afterMatch[0] : "");
    return symbol.length > 0 ? symbol : undefined;
  }
  
  /**
   * Generate documentation for a module based on its symbols
   */
  async generateModuleDocumentation(moduleName: string): Promise<string> {
    const symbols = await this.evaluator.listModuleSymbols(moduleName);
    const exports = await this.evaluator.getModuleExports(moduleName);
    
    let documentation = `# Module: ${moduleName}\n\n`;
    
    // Add module description if available
    const moduleDependencies = this.evaluator instanceof ModuleDependencyTracker 
      ? (this.evaluator as unknown as ModuleDependencyTracker).getModuleDescription(moduleName)
      : "No description available";
    
    if (moduleDependencies) {
      documentation += `${moduleDependencies}\n\n`;
    }
    
    // List exported symbols
    if (exports.length > 0) {
      documentation += "## Exported Symbols\n\n";
      
      for (const sym of exports) {
        const doc = this.getFunctionDocumentation(moduleName, sym) || "No documentation available";
        documentation += `### ${sym}\n\n${doc}\n\n`;
      }
    }
    
    // List other symbols
    const otherSymbols = symbols.filter(s => !exports.includes(s));
    if (otherSymbols.length > 0) {
      documentation += "## Internal Symbols\n\n";
      
      for (const sym of otherSymbols) {
        const doc = this.getFunctionDocumentation(moduleName, sym) || "No documentation available";
        documentation += `### ${sym}\n\n${doc}\n\n`;
      }
    }
    
    return documentation;
  }
}

// Integration with the existing codebase would require modifying the existing handlers
// ... existing code ...

/**
 * Display interactive documentation for HQL functions and modules
 */
async function commandDocs(evaluator: ModuleAwareEvaluator, args: string, useColors: boolean): Promise<void> {
  try {
    // Import the DocumentationManager lazily to avoid circular dependencies
    const { DocumentationManager } = await import("./module-documentation.ts");
    const docManager = new DocumentationManager(evaluator);
    
    // If no args provided, show general help
    if (!args.trim()) {
      console.log(useColors
        ? `${colors.fg.sicpPurple}${colors.bright}HQL Documentation${colors.reset}`
        : "HQL Documentation");
      console.log("\nUse :doc <function> to view documentation for a built-in function");
      console.log("Use :doc <symbol> to view documentation for a symbol in the current module");
      console.log("Use :doc <module>:<symbol> to view documentation for a specific symbol in a module");
      console.log("Use :doc module:<module> to generate documentation for an entire module");
      
      // Show a few example built-ins
      console.log("\nSome built-in functions you can try:");
      const examples = ["+", "map", "filter", "let", "if", "import"];
      for (const example of examples) {
        const doc = docManager.getBuiltinDocumentation(example);
        if (doc) {
          const firstLine = doc.split("\n")[0];
          console.log(useColors
            ? `  ${colors.fg.cyan}${example}${colors.reset} - ${firstLine}`
            : `  ${example} - ${firstLine}`);
        }
      }
      return;
    }
    
    // Handle module documentation requests
    if (args.startsWith("module:")) {
      const moduleName = args.substring("module:".length);
      if (!moduleName.trim()) {
        console.log("Please specify a module name, e.g., :doc module:math");
        return;
      }
      
      const modules = await evaluator.getAvailableModules();
      if (!modules.includes(moduleName)) {
        console.log(`Module '${moduleName}' does not exist. Available modules: ${modules.join(", ")}`);
        return;
      }
      
      // Try to get dependency tracker if it exists
      let dependencyTracker;
      try {
        const { ModuleDependencyTracker } = await import("./module-documentation.ts");
        dependencyTracker = new ModuleDependencyTracker(evaluator);
      } catch (e) {
        // Dependency tracker not available, continue without it
      }
      
      console.log(useColors
        ? `${colors.fg.sicpPurple}${colors.bright}Documentation for module ${moduleName}${colors.reset}`
        : `Documentation for module ${moduleName}`);
      
      const documentation = await docManager.generateModuleDocumentation(moduleName, dependencyTracker);
      console.log(documentation);
      return;
    }
    
    // Handle specific symbol documentation
    if (args.includes(":")) {
      const [moduleName, symbolName] = args.split(":");
      if (!moduleName || !symbolName) {
        console.log("Invalid format. Use :doc module:symbol");
        return;
      }
      
      const modules = await evaluator.getAvailableModules();
      if (!modules.includes(moduleName)) {
        console.log(`Module '${moduleName}' does not exist. Available modules: ${modules.join(", ")}`);
        return;
      }
      
      const symbols = await evaluator.listModuleSymbols(moduleName);
      if (!symbols.includes(symbolName)) {
        console.log(`Symbol '${symbolName}' does not exist in module '${moduleName}'`);
        console.log(`Available symbols: ${symbols.join(", ")}`);
        return;
      }
      
      const doc = docManager.getFunctionDocumentation(moduleName, symbolName);
      if (!doc) {
        console.log(`No documentation available for ${moduleName}:${symbolName}`);
        return;
      }
      
      console.log(useColors
        ? `${colors.fg.sicpPurple}${colors.bright}${moduleName}:${symbolName}${colors.reset}`
        : `${moduleName}:${symbolName}`);
      console.log(doc);
      return;
    }
    
    // Try to find documentation for a symbol or built-in function
    const symbolName = args.trim();
    
    // First check if it's a built-in function
    const builtinDoc = docManager.getBuiltinDocumentation(symbolName);
    if (builtinDoc) {
      console.log(useColors
        ? `${colors.fg.sicpPurple}${colors.bright}${symbolName} (built-in)${colors.reset}`
        : `${symbolName} (built-in)`);
      console.log(builtinDoc);
      return;
    }
    
    // Then check current module
    const currentModule = evaluator.getCurrentModuleSync();
    const currentModuleSymbols = await evaluator.listModuleSymbols(currentModule);
    
    if (currentModuleSymbols.includes(symbolName)) {
      const doc = docManager.getFunctionDocumentation(currentModule, symbolName);
      if (doc) {
        console.log(useColors
          ? `${colors.fg.sicpPurple}${colors.bright}${currentModule}:${symbolName}${colors.reset}`
          : `${currentModule}:${symbolName}`);
        console.log(doc);
      } else {
        console.log(`No documentation available for ${symbolName} in current module ${currentModule}`);
        
        // Try to show definition if available
        try {
          const definition = await evaluator.getSymbolDefinition(symbolName);
          if (definition && definition.source) {
            console.log("\nDefinition:");
            console.log(formatSourceCode(definition.source));
          }
        } catch (e) {
          // Can't show definition, that's ok
        }
      }
      return;
    }
    
    // Check in other modules
    const modules = await evaluator.getAvailableModules();
    let found = false;
    
    for (const module of modules) {
      if (module === currentModule) continue;
      
      const symbols = await evaluator.listModuleSymbols(module);
      if (symbols.includes(symbolName)) {
        const doc = docManager.getFunctionDocumentation(module, symbolName);
        if (doc) {
          console.log(useColors
            ? `${colors.fg.sicpPurple}${colors.bright}${module}:${symbolName}${colors.reset}`
            : `${module}:${symbolName}`);
          console.log(doc);
        } else {
          console.log(`Symbol '${symbolName}' exists in module '${module}' but has no documentation.`);
          console.log(`Use (import [${symbolName}] from "${module}") to import it.`);
        }
        found = true;
        break;
      }
    }
    
    if (!found) {
      console.log(`No documentation found for '${symbolName}'`);
      console.log("Use :doc to see available documentation options.");
    }
  } catch (error) {
    console.error(`Error displaying documentation: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ... existing code ...
async function handleCommand(
  command: string,
  state: ReplState,
  evaluator: ModuleAwareEvaluator,
  history: string[],
  options: ProcessOptions
): Promise<void> {
  // Split command into parts (e.g., :command arg1 arg2)
  const [cmd, ...args] = command.trim().split(/\s+/);
  const argsText = args.join(" ");
  
  const cmdLower = cmd.toLowerCase();
  
  try {
    // Multi-command support for convenience (e.g., q instead of quit)
    if (cmdLower === "help" || cmdLower === "h") {
      commandHelp(argsText, options.useColors);
    }
    else if (cmdLower === "quit" || cmdLower === "q" || cmdLower === "exit") {
      commandQuit(options.replState.setRunning);
    }
    else if (cmdLower === "env" || cmdLower === "e") {
      commandEnv(evaluator, options.useColors, options.logger);
    }
    else if (cmdLower === "macros" || cmdLower === "m") {
      commandMacros(evaluator, options.useColors);
    }
    else if (cmdLower === "modules" || cmdLower === "mod") {
      await commandModules(evaluator, options.useColors);
    }
    else if (cmdLower === "module") {
      await commandModule(evaluator, state, argsText);
    }
    else if (cmdLower === "list" || cmdLower === "ls") {
      await commandList(evaluator, options.useColors);
    }
    else if (cmdLower === "remove" || cmdLower === "rm") {
      await commandRemove(evaluator, argsText, options.useColors, state);
    }
    else if (cmdLower === "see") {
      await commandSee(evaluator, argsText, options.useColors, options.showJs);
    }
    else if (cmdLower === "doc" || cmdLower === "docs") {
      await commandDocs(evaluator, argsText, options.useColors);
    }
    else if (cmdLower === "verbose") {
      commandVerbose(options.logger, options.replState.setVerbose);
    }
    // ... existing code ...
  } catch (error) {
    console.error(`Error handling command: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Interface for tab completion provider
 */
interface TabCompletion {
  getCompletions(line: string, cursorPos: number): Promise<string[]>;
}

/**
 * Main entry point for the REPL
 * This function is exported and used by cli/repl.ts
 */
export async function startRepl(options: ReplOptions = {}): Promise<void> {
  console.log("Starting HQL REPL...");
  
  const logger = new Logger(options.verbose ?? false);
  const baseDir = options.baseDir ?? Deno.cwd();
  const useColors = options.useColors ?? true;
  const historySize = options.historySize ?? 100;
  const enableCompletion = options.enableCompletion ?? true;
  
  let running = true;
  const history: string[] = historyManager.load(historySize);
  let historyIndex = -1;
  
  // REPL display options
  let showVerbose = false;
  let showAst = options.showAst ?? false;
  let showExpanded = options.showExpanded ?? false;
  let showJs = options.showJs ?? false;
  
  // Create a basic state object
  const replState: ReplState = { 
    multilineMode: false, 
    multilineInput: "", 
    parenBalance: 0,
    importHandlerActive: false,
    currentModule: "global",
    bracketStack: []
  };
  
  printBanner(useColors);
  
  try {
    // Initialize environment
    const env = await Environment.initializeGlobalEnv({ verbose: options.verbose });
    await loadSystemMacros(env, { verbose: options.verbose, baseDir: Deno.cwd() });
    
    // Create evaluator
    const evaluator = new ModuleAwareEvaluator(env, {
      verbose: options.verbose,
      baseDir,
      showAst: options.showAst,
      showExpanded: options.showExpanded,
      showJs: options.showJs,
    });
    
    // Initialize evaluator
    await evaluator.initialize();
    await evaluator.switchModule("global");
    replState.currentModule = evaluator.getCurrentModuleSync();

    // Setup tab completion if enabled
    let tabCompletion: TabCompletion | undefined;
    if (enableCompletion) {
      tabCompletion = {
        getCompletions: async (line: string, cursorPos: number): Promise<string[]> => {
          // First, check if we're completing a command (starts with :)
          if (line.trim().startsWith(':')) {
            const commandPart = line.trim().substring(1); // Remove the colon
            const commands = [
              "help", "quit", "exit", "env", "macros", 
              "module", "modules", "list", "see", "remove",
              "verbose", "ast", "js"
            ];
            
            // Filter commands based on what's already typed
            return commands
              .filter(cmd => cmd.startsWith(commandPart))
              .map(cmd => `:${cmd}`); // Add the colon back
          }
          
          // Get current module exports and environment bindings
          const currentModule = replState.currentModule;
          const symbols: string[] = [];
          
          try {
            // Get current module's symbols
            const moduleSymbols = await evaluator.listModuleSymbols(currentModule);
            symbols.push(...moduleSymbols);
            
            // Get special forms and keywords
            const specialForms = [
              // Core special forms
              "if", "let", "lambda", "fn", "def", "import", "module", "do", "quote",
              // Control flow
              "loop", "recur", "when", "unless", "cond", "case",
              // Collections
              "list", "vector", "map", "set", "concat", "cons", "first", "rest",
              // Functions
              "apply", "filter", "map", "reduce", "compose", "partial",
              // I/O
              "print", "println", "read", "slurp", "spit",
              // Other common operations
              "not", "and", "or", "str", "range", "repeat", "inc", "dec", "even?", "odd?",
              // Math
              "+", "-", "*", "/", "mod", "pow", "max", "min", "abs"
            ];
            symbols.push(...specialForms);
            
            // Filter based on current text
            const currentWord = getCurrentWordInContext(line, cursorPos);
            if (currentWord) {
              return symbols.filter(sym => sym.startsWith(currentWord));
            }
          } catch (error) {
            // Ignore errors during completion
          }
          
          return symbols;
        }
      };
    }
    
    // Load initial file if specified
    if (options.initialFile) {
      const file = options.initialFile;
      try {
        logger.log({ text: `Loading file: ${file}`, namespace: "repl" });
        const content = await Deno.readTextFile(file);
        await evaluator.evaluate(content, {
          verbose: options.verbose,
          baseDir,
          showAst: options.showAst,
          showExpanded: options.showExpanded,
          showJs: options.showJs,
        });
        logger.log({ text: `File ${file} loaded successfully`, namespace: "repl" });
      } catch (error) {
        console.error(`Error loading file ${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Setup terminal for raw mode if available
    let isRawMode = false;
    try {
      if (Deno.build.os !== "windows") {
        Deno.stdin.setRaw(true);
        isRawMode = true;
      }
    } catch (e) {
      // Raw mode not supported, will use normal mode
      console.log("Warning: Advanced keyboard handling not available. History navigation may be limited.");
    }

    // Main REPL loop
    while (running) {
      try {
        const prompt = getPrompt(replState, useColors);
        
        // Handle input differently based on whether raw mode is available
        let input = "";
        
        if (isRawMode) {
          // Raw mode available - handle keyboard input directly
          Deno.stdout.writeSync(new TextEncoder().encode(prompt));
          input = await readLineWithArrowKeys(prompt, history, historyIndex, tabCompletion);
          
          // Check for Ctrl+D or Ctrl+C
          if (input === "\x04" || input === "\x03") {
            console.log("\nExiting REPL...");
            running = false;
            continue;
          }
          
          // Add newline since we're in raw mode
          Deno.stdout.writeSync(new TextEncoder().encode("\n"));
        } else {
          // Normal mode - basic input
          Deno.stdout.writeSync(new TextEncoder().encode(prompt));
          const buf = new Uint8Array(1024);
          const n = await Deno.stdin.read(buf);
          
          if (n === null) {
            console.log("\nExiting REPL...");
            running = false;
            continue;
          }
          
          input = new TextDecoder().decode(buf.subarray(0, n)).trim();
        }
        
        // Reset history index
        historyIndex = -1;
        
        // Handle empty input
        if (!input) continue;
        
        // Save to history if non-empty
        if (input.trim()) {
          if (history.length === 0 || history[history.length-1] !== input) {
            history.push(input);
            historyManager.save(history.slice(-historySize));
          }
        }
        
        // Handle commands or evaluate input
        if (input.startsWith(':')) {
          const [command, ...args] = input.substring(1).split(/\s+/);
          const argsText = args.join(' ');
          
          switch (command.toLowerCase()) {
            case 'quit':
            case 'exit':
              console.log("Exiting REPL...");
              running = false;
              break;
              
            case 'help':
              if (argsText.trim()) {
                console.log(getDetailedHelp(argsText.trim().toLowerCase(), useColors));
              } else {
                printBanner(useColors);
              }
              break;
              
            case 'verbose':
              if (argsText.trim()) {
                // :verbose expression - evaluate with verbose output
                try {
                  const result = await evaluator.evaluate(argsText, {
                    verbose: true,
                    baseDir,
                    showAst: true,
                    showExpanded: true,
                    showJs: true,
                  });
                  
                  // Display detailed result
                  console.log(result);
                } catch (error) {
                  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
                }
              } else {
                // Toggle verbose mode
                showVerbose = !showVerbose;
                console.log(`Verbose mode: ${showVerbose ? "ON" : "OFF"}`);
              }
              break;
              
            case 'ast':
              if (argsText.trim()) {
                // :ast expression - show AST for expression
                try {
                  const result = await evaluator.evaluate(argsText, {
                    verbose: false,
                    baseDir,
                    showAst: true, 
                    showExpanded: false,
                    showJs: false,
                  });
                  
                  if (typeof result === 'object' && result !== null) {
                    // Only show the AST parts
                    const { parsedExpressions } = result;
                    console.log(JSON.stringify(parsedExpressions, null, 2));
                  } else {
                    console.log(result);
                  }
                } catch (error) {
                  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
                }
              } else {
                // Toggle AST mode
                showAst = !showAst;
                console.log(`AST display mode: ${showAst ? "ON" : "OFF"}`);
              }
              break;
              
            case 'js':
              if (argsText.trim()) {
                // :js expression - show transpiled JavaScript for expression
                try {
                  const result = await evaluator.evaluate(argsText, {
                    verbose: false,
                    baseDir,
                    showAst: false, 
                    showExpanded: false,
                    showJs: true,
                  });
                  
                  if (typeof result === 'object' && result !== null && 'jsSource' in result) {
                    console.log(`=> ${result.jsSource}`);
                  } else {
                    console.log("No JavaScript transpilation available.");
                  }
                } catch (error) {
                  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
                }
              } else {
                // Toggle JS mode
                showJs = !showJs;
                console.log(`JavaScript display mode: ${showJs ? "ON" : "OFF"}`);
              }
              break;
              
            case 'env':
              try {
                // Show environment bindings
                await commandEnv(evaluator, useColors, logger);
              } catch (error) {
                console.error(`Error displaying environment: ${error instanceof Error ? error.message : String(error)}`);
              }
              break;
              
            case 'macros':
              try {
                // Show defined macros
                commandMacros(evaluator, useColors);
              } catch (error) {
                console.error(`Error displaying macros: ${error instanceof Error ? error.message : String(error)}`);
              }
              break;
              
            case 'module':
              if (argsText.trim()) {
                try {
                  await commandModule(evaluator, replState, argsText.trim());
                } catch (error) {
                  console.error(`Error switching modules: ${error instanceof Error ? error.message : String(error)}`);
                }
              } else {
                console.log(`Current module: ${replState.currentModule}`);
              }
              break;
              
            case 'modules':
              try {
                // List all available modules
                await commandModules(evaluator, useColors);
              } catch (error) {
                console.error(`Error listing modules: ${error instanceof Error ? error.message : String(error)}`);
              }
              break;
              
            case 'list':
              try {
                // Show symbols in current module
                await commandList(evaluator, useColors);
              } catch (error) {
                console.error(`Error listing symbols: ${error instanceof Error ? error.message : String(error)}`);
              }
              break;
              
            case 'see':
              try {
                // Inspect modules and symbols
                await commandSee(evaluator, argsText, useColors, showJs);
              } catch (error) {
                console.error(`Error inspecting: ${error instanceof Error ? error.message : String(error)}`);
              }
              break;
              
            case 'remove':
              try {
                // Remove a symbol or module
                await commandRemove(evaluator, argsText, useColors, replState);
              } catch (error) {
                console.error(`Error removing: ${error instanceof Error ? error.message : String(error)}`);
              }
              break;
              
            default:
              console.log(`Unknown command: ${command}`);
              break;
          }
          continue;
        }
        
        // Check for multiline input
        try {
          // Update paren balance
          replState.parenBalance = updateParenBalance(input, replState.parenBalance);
          
          if (replState.multilineMode) {
            // Continue multiline input
            replState.multilineInput += input + "\n";
            
            // If balance is restored, evaluate the complete input
            if (replState.parenBalance <= 0) {
              const fullInput = replState.multilineInput.trim();
              const result = await evaluator.evaluate(fullInput, {
                verbose: showVerbose,
                baseDir,
                showAst: showAst,
                showExpanded: showExpanded,
                showJs: showJs,
              });
              
              if (result !== undefined) {
                // Only show simple result by default
                if (showVerbose) {
                  console.log(result);
                } else {
                  // Check if result has a value property
                  if (result && typeof result === 'object' && 'value' in result) {
                    console.log(result.value);
                  } else {
                    console.log(result);
                  }
                }
              }
              
              // Reset multiline state
              replState.multilineMode = false;
              replState.multilineInput = "";
              replState.parenBalance = 0;
            }
          } else if (replState.parenBalance > 0) {
            // Start multiline input
            replState.multilineMode = true;
            replState.multilineInput = input + "\n";
          } else {
            // Single line evaluation
            const result = await evaluator.evaluate(input, {
              verbose: showVerbose,
              baseDir,
              showAst: showAst,
              showExpanded: showExpanded,
              showJs: showJs,
            });
            
            if (result !== undefined) {
              // Only show simple result by default
              if (showVerbose) {
                console.log(result);
              } else {
                // Check if result has a value property
                if (result && typeof result === 'object' && 'value' in result) {
                  console.log(result.value);
                } else {
                  console.log(result);
                }
              }
            }
          }
        } catch (error) {
          console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
          
          // Reset multiline state on error
          replState.multilineMode = false;
          replState.multilineInput = "";
          replState.parenBalance = 0;
        }
      } catch (error) {
        console.error(`REPL error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Restore terminal mode
    if (isRawMode) {
      try {
        Deno.stdin.setRaw(false);
      } catch (e) {
        // Ignore errors when resetting raw mode
      }
    }
  } catch (error) {
    console.error(`REPL initialization error: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

/**
 * Enhanced helper to extract the current word for tab completion
 * Works with nested expressions and partial words
 */
function getCurrentWordInContext(line: string, cursorPos: number): string {
  if (cursorPos <= 0 || cursorPos > line.length) return "";
  
  // Get the part of the line up to the cursor
  const beforeCursor = line.substring(0, cursorPos);
  
  // Find the last opening delimiter or whitespace before cursor
  const lastDelimiter = Math.max(
    beforeCursor.lastIndexOf('('),
    beforeCursor.lastIndexOf('['),
    beforeCursor.lastIndexOf('{'),
    beforeCursor.lastIndexOf(' '),
    beforeCursor.lastIndexOf('\n'),
    beforeCursor.lastIndexOf('\t')
  );
  
  // Extract the partial word between the delimiter and cursor
  if (lastDelimiter >= 0) {
    return beforeCursor.substring(lastDelimiter + 1);
  }
  
  // If no delimiter, use the whole string up to cursor
  return beforeCursor;
}

/**
 * Read a line with support for arrow key navigation through history, tab completion,
 * and advanced keyboard shortcuts
 */
async function readLineWithArrowKeys(
  prompt: string, 
  history: string[], 
  historyIndex: number,
  tabCompletion?: TabCompletion
): Promise<string> {
  let input = "";
  let cursorPos = 0;
  let localHistoryIndex = historyIndex;
  let originalInput = input;
  let completions: string[] = [];
  let completionIndex = -1;
  
  while (true) {
    const buf = new Uint8Array(3);
    const n = await Deno.stdin.read(buf);
    
    if (n === null) {
      // EOF
      return "\x04"; // Ctrl+D
    }
    
    // Check for control sequences
    if (buf[0] === 1) { // Ctrl+A - move to beginning of line
      cursorPos = 0;
      Deno.stdout.writeSync(new TextEncoder().encode("\r"));
      Deno.stdout.writeSync(new TextEncoder().encode(prompt));
      continue;
    }
    
    if (buf[0] === 5) { // Ctrl+E - move to end of line
      cursorPos = input.length;
      Deno.stdout.writeSync(new TextEncoder().encode("\r"));
      Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
      continue;
    }
    
    if (buf[0] === 11) { // Ctrl+K - delete from cursor to end of line
      input = input.substring(0, cursorPos);
      Deno.stdout.writeSync(new TextEncoder().encode("\r"));
      Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
      Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
      continue;
    }
    
    if (buf[0] === 21) { // Ctrl+U - delete from beginning of line to cursor
      input = input.substring(cursorPos);
      cursorPos = 0;
      Deno.stdout.writeSync(new TextEncoder().encode("\r"));
      Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
      Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
      continue;
    }
    
    if (buf[0] === 23) { // Ctrl+W - delete word backwards
      const beforeCursor = input.substring(0, cursorPos);
      // Find the start of the current word
      const match = beforeCursor.match(/.*\s(\S+)$/);
      if (match) {
        const wordStart = beforeCursor.lastIndexOf(match[1]);
        input = input.substring(0, wordStart) + input.substring(cursorPos);
        cursorPos = wordStart;
      } else {
        // No word found, clear everything before cursor
        input = input.substring(cursorPos);
        cursorPos = 0;
      }
      
      Deno.stdout.writeSync(new TextEncoder().encode("\r"));
      Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
      Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
      continue;
    }
    
    // Tab completion
    if (buf[0] === 9) { // Tab key
      if (tabCompletion) {
        if (completions.length === 0) {
          // Get completions
          completions = await tabCompletion.getCompletions(input, cursorPos);
          completionIndex = 0;
        } else {
          // Cycle through completions
          completionIndex = (completionIndex + 1) % completions.length;
        }
        
        if (completions.length > 0) {
          // Apply the completion
          if (input.trim().startsWith(':')) {
            // Command completion - replace entire input
            input = completions[completionIndex];
            cursorPos = input.length;
          } else {
            // Symbol completion - replace current word
            const currentWord = getCurrentWordInContext(input, cursorPos);
            const completion = completions[completionIndex];
            
            // Replace current word with completion
            const beforeWord = input.substring(0, cursorPos - currentWord.length);
            const afterWord = input.substring(cursorPos);
            
            // Create new input with completion
            input = beforeWord + completion + afterWord;
            
            // Update cursor position
            cursorPos = beforeWord.length + completion.length;
          }
          
          // Redraw the line
          Deno.stdout.writeSync(new TextEncoder().encode("\r"));
          Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
          Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
          
          // Position cursor
          if (cursorPos < input.length) {
            Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${prompt.length + cursorPos}G`));
          }
        }
        
        continue;
      }
    } else {
      // Reset completions when any other key is pressed
      completions = [];
      completionIndex = -1;
    }
    
    // Arrow keys and special key sequences
    if (buf[0] === 27) {
      if (buf[1] === 91) { // ESC [ sequence
        if (buf[2] === 65) { // Up arrow
          if (history.length > 0) {
            // Save current input the first time we navigate
            if (localHistoryIndex === -1) {
              originalInput = input;
            }
            
            // Navigate up through history
            localHistoryIndex = Math.min(localHistoryIndex + 1, history.length - 1);
            const historyItem = history[history.length - 1 - localHistoryIndex];
            
            // Clear current line and reset cursor to beginning of line
            Deno.stdout.writeSync(new TextEncoder().encode("\r"));
            // Erase from cursor to end of line
            Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
            Deno.stdout.writeSync(new TextEncoder().encode(prompt));
            
            // Show history item
            input = historyItem;
            Deno.stdout.writeSync(new TextEncoder().encode(input));
            cursorPos = input.length;
          }
        } 
        else if (buf[2] === 66) { // Down arrow
          // Clear current line
          Deno.stdout.writeSync(new TextEncoder().encode("\r"));
          Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
          Deno.stdout.writeSync(new TextEncoder().encode(prompt));
          
          if (localHistoryIndex > 0) {
            // Navigate down through history
            localHistoryIndex--;
            const historyItem = history[history.length - 1 - localHistoryIndex];
            input = historyItem;
          } else if (localHistoryIndex === 0) {
            // Return to original input
            localHistoryIndex = -1;
            input = originalInput;
          }
          
          // Show the result
          Deno.stdout.writeSync(new TextEncoder().encode(input));
          cursorPos = input.length;
        }
        else if (buf[2] === 67) { // Right arrow
          if (cursorPos < input.length) {
            cursorPos++;
            Deno.stdout.writeSync(new TextEncoder().encode("\x1b[C")); // Move cursor right
          }
        }
        else if (buf[2] === 68) { // Left arrow
          if (cursorPos > 0) {
            cursorPos--;
            Deno.stdout.writeSync(new TextEncoder().encode("\x1b[D")); // Move cursor left
          }
        }
        // Support for Home/End keys
        else if (buf[2] === 72 || (buf[2] === 49 && buf[3] === 126)) { // Home key
          cursorPos = 0;
          Deno.stdout.writeSync(new TextEncoder().encode("\r"));
          Deno.stdout.writeSync(new TextEncoder().encode(prompt));
        }
        else if (buf[2] === 70 || (buf[2] === 52 && buf[3] === 126)) { // End key
          cursorPos = input.length;
          Deno.stdout.writeSync(new TextEncoder().encode("\r"));
          Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
        }
        // Delete key
        else if (buf[2] === 51 && buf[3] === 126) { // Delete key
          if (cursorPos < input.length) {
            input = input.substring(0, cursorPos) + input.substring(cursorPos + 1);
            Deno.stdout.writeSync(new TextEncoder().encode("\r"));
            Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
            Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
            // Position cursor
            if (cursorPos < input.length) {
              Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${prompt.length + cursorPos}G`));
            }
          }
        }
        continue;
      }
      // Handle Alt key combinations (ESC followed by character)
      else if (buf[1] >= 32 && buf[1] <= 126) {
        if (buf[1] === 98 || buf[1] === 66) { // Alt+B / Alt+b (move back one word)
          const beforeCursor = input.substring(0, cursorPos);
          const wordMatch = beforeCursor.match(/.*\b(\w+)\s*$/);
          if (wordMatch) {
            const wordStart = beforeCursor.lastIndexOf(wordMatch[1]);
            cursorPos = wordStart;
            Deno.stdout.writeSync(new TextEncoder().encode("\r"));
            Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
            Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${prompt.length + cursorPos}G`));
          }
          continue;
        }
        else if (buf[1] === 102 || buf[1] === 70) { // Alt+F / Alt+f (move forward one word)
          const afterCursor = input.substring(cursorPos);
          const wordMatch = afterCursor.match(/^\s*(\w+)/);
          if (wordMatch && wordMatch[1]) {
            const wordEnd = cursorPos + wordMatch[0].length;
            cursorPos = wordEnd;
            Deno.stdout.writeSync(new TextEncoder().encode("\r"));
            Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
            Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${prompt.length + cursorPos}G`));
          } else {
            cursorPos = input.length;
            Deno.stdout.writeSync(new TextEncoder().encode("\r"));
            Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
          }
          continue;
        }
        else if (buf[1] === 100 || buf[1] === 68) { // Alt+D / Alt+d (delete word forward)
          const afterCursor = input.substring(cursorPos);
          const wordMatch = afterCursor.match(/^\s*(\w+)/);
          if (wordMatch) {
            const wordEnd = cursorPos + wordMatch[0].length;
            input = input.substring(0, cursorPos) + input.substring(wordEnd);
            Deno.stdout.writeSync(new TextEncoder().encode("\r"));
            Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
            Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
            Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${prompt.length + cursorPos}G`));
          }
          continue;
        }
      }
    }
    
    // Handle Enter
    if (buf[0] === 13) {
      return input;
    }
    
    // Handle Ctrl+C
    if (buf[0] === 3) {
      Deno.stdout.writeSync(new TextEncoder().encode("^C\n"));
      return "\x03"; // Return ETX character to signal Ctrl+C
    }
    
    // Handle Ctrl+D (EOF)
    if (buf[0] === 4) {
      if (input.length === 0) {
        return "\x04"; // Signal EOF only if input is empty
      }
      continue;
    }
    
    // Handle Backspace
    if (buf[0] === 127 || buf[0] === 8) {
      if (cursorPos > 0) {
        // Remove character at cursor position
        input = input.substring(0, cursorPos - 1) + input.substring(cursorPos);
        cursorPos--;
        
        // Redraw the line
        Deno.stdout.writeSync(new TextEncoder().encode("\r"));
        Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
        Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
        
        // Position cursor
        if (cursorPos < input.length) {
          Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${prompt.length + cursorPos}G`));
        }
      }
      continue;
    }
    
    // Handle regular character input
    if (buf[0] >= 32 && buf[0] <= 126) {
      // Insert character at cursor position
      const char = String.fromCharCode(buf[0]);
      input = input.substring(0, cursorPos) + char + input.substring(cursorPos);
      cursorPos++;
      
      // Redraw the line
      Deno.stdout.writeSync(new TextEncoder().encode("\r"));
      Deno.stdout.writeSync(new TextEncoder().encode("\x1b[K"));
      Deno.stdout.writeSync(new TextEncoder().encode(prompt + input));
      
      // Position cursor
      if (cursorPos < input.length) {
        Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${prompt.length + cursorPos}G`));
      }
    }
  }
}

/**
 * Helper function to get detailed help for each command
 */
function getDetailedHelp(command: string, useColors: boolean): string {
  const helpText: Record<string, string> = {
    "help": "Display help information about available commands.",
    "quit": "Exit the REPL session.",
    "exit": "Exit the REPL session.",
    "env": "Display all environment bindings (defined variables and functions).",
    "macros": "Show all defined macros.",
    "module": "Switch to a different module or show the current module.",
    "modules": "List all available modules.",
    "list": "Show all symbols defined in the current module.",
    "remove": "Remove a symbol or module.",
    "see": "Inspect modules and symbols in detail.",
    "verbose": "Toggle verbose output mode or evaluate an expression with verbose output.",
    "ast": "Toggle AST display mode or show the AST for a specific expression.",
    "js": "Show the JavaScript transpilation for a given expression."
  };
  
  return helpText[command] || `No detailed help available for '${command}'.`;
}