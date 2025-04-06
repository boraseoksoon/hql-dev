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
    `${headerColor}║    ${commandColor}:help${textColor} - Display help (use ${commandColor}:help <command>${textColor} for details)${headerColor}     ║${reset}`,
    `${headerColor}║    ${commandColor}:quit${textColor}, ${commandColor}:exit${textColor} - Exit the REPL${headerColor}                             ║${reset}`,
    `${headerColor}║    ${commandColor}:env${textColor} - Show environment bindings${headerColor}                         ║${reset}`,
    `${headerColor}║    ${commandColor}:macros${textColor} - Show defined macros${headerColor}                            ║${reset}`,
    `${headerColor}║    ${commandColor}:module${textColor} - Switch to module or show current${headerColor}               ║${reset}`,
    `${headerColor}║    ${commandColor}:modules${textColor} - List all available modules${headerColor}                    ║${reset}`,
    `${headerColor}║    ${commandColor}:list${textColor} - Show symbols in current module${headerColor}                   ║${reset}`,
    `${headerColor}║    ${commandColor}:see${textColor} - Inspect modules and symbols${headerColor}                       ║${reset}`,
    `${headerColor}║    ${commandColor}:remove${textColor} - Remove a symbol or module${headerColor}                      ║${reset}`,
    `${headerColor}║    ${commandColor}:write${textColor} - Open a text editor for multiline code${headerColor}           ║${reset}`,
    `${headerColor}║    ${commandColor}:js${textColor} - Toggle JavaScript transpiled code display${headerColor}          ║${reset}`,
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
      : `${colors.fg.sicpPurple}${colors.bright}hql[${colors.fg.sicpRed}${moduleName}${colors.fg.sicpPurple}]> ${colors.reset}`;
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
  // Get the list of modules and current module
  const modules = await evaluator.getAvailableModules();
  const currentModule = evaluator.getCurrentModuleSync();
  
  console.log(colorText("Available Modules:", colors.fg.sicpPurple + colors.bright, useColors));
  
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
  
  console.log("\nTo switch modules: :module <name>");
  console.log("To see module contents: :see <module-name>");
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
    console.error("No target specified. Use :remove <symbol>, :remove module:<name>, or :remove all");
    console.log("For more information, try :help remove");
    return;
  }
  
  const argText = args.trim();
  const availableModules = evaluator.getAvailableModules();
  
  // Handle special "all" cases (previously handled by :reset)
  if (argText === "all") {
    // Remove everything (full reset)
    await confirmAndExecute(
      "Remove all modules and definitions? This will reset the entire environment.",
      () => {
        evaluator.resetEnvironment(false);
        state.currentModule = evaluator.getCurrentModule();
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
        state.currentModule = evaluator.getCurrentModule();
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
        const currentModule = evaluator.getCurrentModule();
        const modules = evaluator.getAvailableModules();
        
        // Remove each module except the current one
        let removedCount = 0;
        modules.forEach(moduleName => {
          if (moduleName !== currentModule && moduleName !== "user") {
            if (evaluator.removeModule(moduleName)) {
              removedCount++;
            }
          }
        });
        
        console.log(colorText(`Removed ${removedCount} modules. Kept '${currentModule}' as the current module.`, 
          colors.fg.green, useColors));
      },
      useColors
    );
    return;
  }
  
  // Check if we're removing a specific module using colon syntax
  if (argText.startsWith("module:")) {
    const moduleName = argText.substring("module:".length);
    
    if (!moduleName) {
      console.error("No module name specified. Use :remove module:<name>");
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
      () => {
        const removed = evaluator.removeModule(moduleName);
        
        if (removed) {
          console.log(colorText(`Module '${moduleName}' has been removed.`, colors.fg.green, useColors));
          
          // If we removed the current module, update state
          if (state.currentModule === moduleName) {
            state.currentModule = evaluator.getCurrentModule();
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
    
    await confirmAndExecute(
      `Remove symbol '${symbolName}' from module '${moduleName}'?`,
      () => {
        const removed = evaluator.removeSymbolFromModule(symbolName, moduleName);
        
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
    // Special case for user module when trying to remove with `:remove user`
    if (symbolName === "user") {
      console.error(`Error: The default 'user' module cannot be removed.`);
      console.log(`The 'user' module is the fundamental module that exists when the REPL starts.`);
      console.log(`You can remove individual symbols from the user module with :remove <symbol-name>`);
      console.log(`You can use :remove all to reset all modules including user to a clean state.`);
      return;
    }
    
    console.error(`'${symbolName}' is a module name, not a symbol.`);
    console.log(`To remove a module, use :remove module:${symbolName}`);
    return;
  }
  
  // Check if symbol exists in current module before prompting
  const currentModule = evaluator.getCurrentModule();
  const moduleSymbols = evaluator.listModuleSymbols(currentModule);
  if (!moduleSymbols.includes(symbolName)) {
    console.error(`Symbol '${symbolName}' not found in module '${currentModule}'.`);
    
    // If it looks like they're trying to remove a module, offer guidance
    if (symbolName !== "user" && availableModules.some(m => m.includes(symbolName) || symbolName.includes(m))) {
      console.log(`If you're trying to remove a module, use :remove module:${symbolName}`);
    }
    
    return;
  }
  
  await confirmAndExecute(
    `Remove symbol '${symbolName}' from current module '${evaluator.getCurrentModule()}'?`,
    () => {
      const removed = evaluator.removeSymbol(symbolName);
      
      if (removed) {
        console.log(colorText(`Symbol '${symbolName}' has been removed from module '${evaluator.getCurrentModule()}'.`, 
          colors.fg.green, useColors));
      } else {
        console.error(`Symbol '${symbolName}' not found in module '${evaluator.getCurrentModule()}'.`);
      }
    },
    useColors
  );
}

// Helper function for confirmation dialogs using Deno's API
async function confirmAndExecute(message: string, action: () => void, useColors: boolean): Promise<void> {
  console.log(colorText(message, colors.fg.yellow, useColors));
  console.log("Type 'y' or 'yes' to confirm: ");
  
  // Use Deno's prompt for user input
  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);
  
  if (n) {
    const answer = new TextDecoder().decode(buf.subarray(0, n)).trim().toLowerCase();
    
    if (answer === "yes" || answer === "y") {
      action();
    } else {
      console.log("Operation cancelled.");
    }
  } else {
    console.log("Operation cancelled.");
  }
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

// Helper to format source code with proper indentation
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
  const macroSymbols: string[] = [];
  const variableSymbols: string[] = [];
  const otherSymbols: string[] = [];
  
  // Create a set of exports for quick lookup
  const exportSet = new Set(exports);
  
  // Properly categorize each symbol by getting its definition from the module
  for (const symbol of symbols) {
    try {
      // Get the symbol definition with proper module context
      const definition = await evaluator.getSymbolDefinition(symbol, moduleName);
      
      if (definition) {
        // Use the metadata to determine the symbol type
        if (definition.metadata && definition.metadata.type) {
          const type = definition.metadata.type;
          if (type === 'functions') {
            functionSymbols.push(symbol);
          } else if (type === 'macros') {
            macroSymbols.push(symbol);
          } else if (type === 'variables') {
            variableSymbols.push(symbol);
          } else {
            otherSymbols.push(symbol);
          }
        } 
        // If no metadata, determine type based on value
        else if (typeof definition.value === 'function') {
          functionSymbols.push(symbol);
        } else {
          variableSymbols.push(symbol);
        }
      } else {
        otherSymbols.push(symbol);
      }
    } catch (error) {
      // If there's an error getting the definition, just put it in other symbols
      otherSymbols.push(symbol);
    }
  }
  
  // Display functions
  if (functionSymbols.length > 0) {
    console.log(colorText("\nFunctions:", colors.fg.sicpBlue + colors.bright, useColors));
    console.log("------------");
    functionSymbols.sort().forEach(symbol => {
      const isExported = exportSet.has(symbol);
      const marker = isExported ? colorText(' (exported)', colors.fg.green, useColors) : '';
      console.log(`- ${symbol}${marker}`);
    });
  }
  
  // Display macros
  if (macroSymbols.length > 0) {
    console.log(colorText("\nMacros:", colors.fg.magenta + colors.bright, useColors));
    console.log("------------");
    macroSymbols.sort().forEach(symbol => {
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
  
  // Show summary of exports if any
  if (exports.length > 0) {
    console.log(colorText("\nExports Summary:", colors.fg.lightGreen + colors.bright, useColors));
    console.log("------------");
    console.log(colorText(exports.join(", "), colors.fg.green, useColors));
  }
  
  console.log("\nUsage:");
  console.log(`To see a specific symbol: :see ${moduleName}:<symbol-name>`);
  console.log(`To see only exports: :see ${moduleName}:exports`);
  
  // Get current module through more reliable sync method
  const currentModule = evaluator.getCurrentModuleSync();
  if (moduleName !== currentModule) {
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
function showAllModuleNames(evaluator: ModuleAwareEvaluator, useColors: boolean): void {
  const modules = evaluator.getAvailableModules();
  const currentModule = evaluator.getCurrentModule();
  
  console.log(colorText("Available Modules:", colors.fg.sicpRed + colors.bright, useColors));
  console.log(colorText("─".repeat(60), colors.fg.white, useColors));
  
  if (modules.length === 0) {
    console.log("No modules defined in the system.");
    return;
  }
  
  console.log("Module names:");
  console.log("------------");
  
  modules.forEach(moduleName => {
    const marker = moduleName === currentModule ? "* " : "  ";
    console.log(`${marker}${moduleName}`);
  });
  
  console.log("------------");
  console.log("* Current module");
  
  console.log("\nUsage:");
  console.log("To create or switch to a module: :module <name>");
  console.log("To see a specific module's details: :see <module-name>");
}

// Helper function to show all symbols across all modules
function showAllSymbols(evaluator: ModuleAwareEvaluator, useColors: boolean, showJs: boolean): void {
  const modules = evaluator.getAvailableModules();
  
  console.log(colorText("All Symbols (Across All Modules):", colors.fg.sicpRed + colors.bright, useColors));
  console.log(colorText("─".repeat(60), colors.fg.white, useColors));
  
  if (modules.length === 0) {
    console.log("No modules or symbols defined in the system.");
    return;
  }
  
  let totalSymbols = 0;
  
  modules.forEach(moduleName => {
    const symbols = evaluator.listModuleSymbols(moduleName);
    totalSymbols += symbols.length;
    
    if (symbols.length === 0) {
      return;
    }
    
    console.log(colorText(`\nModule: ${moduleName}`, colors.fg.sicpPurple + colors.bright, useColors));
    console.log("------------");
    
    symbols.sort().forEach(symbol => {
      const definition = evaluator.getSymbolDefinition(symbol, moduleName);
      const exports = evaluator.getModuleExports(moduleName);
      const isExported = exports.includes(symbol);
      
      let typeInfo = "unknown";
      if (definition) {
        if (typeof definition.value === 'function') {
          typeInfo = "function";
        } else {
          typeInfo = "variable";
        }
      }
      
      const exportMarker = isExported ? colorText(" (exported)", colors.fg.green, useColors) : "";
      console.log(`- ${moduleName}:${symbol} [${typeInfo}]${exportMarker}`);
    });
  });
  
  console.log(colorText("\nSummary:", colors.fg.cyan, useColors));
  console.log(`Total: ${totalSymbols} symbols across ${modules.length} modules`);
  
  console.log("\nUsage:");
  console.log("To see a specific symbol: :see <module-name>:<symbol-name>");
  console.log("To see a specific module: :see <module-name>");
}

// Helper function to show exports from a module
function showModuleExports(evaluator: ModuleAwareEvaluator, moduleName: string, useColors: boolean): void {
  const exports = evaluator.getModuleExports(moduleName);
  
  const isCurrentModule = moduleName === evaluator.getCurrentModule();
  const title = isCurrentModule ? 
    `Exports from Current Module (${moduleName}):` : 
    `Exports from Module '${moduleName}':`;
  
  console.log(colorText(title, colors.fg.sicpRed + colors.bright, useColors));
  console.log(colorText("─".repeat(60), colors.fg.white, useColors));
  
  if (exports.length === 0) {
    console.log(`No symbols exported from module '${moduleName}'.`);
    return;
  }
  
  console.log(colorText("Exported Symbols:", colors.fg.lightGreen, useColors));
  console.log("------------");
  
  exports.sort().forEach(symbol => {
    const definition = evaluator.getSymbolDefinition(symbol, moduleName);
    
    let typeInfo = "unknown";
    if (definition) {
      if (typeof definition.value === 'function') {
        typeInfo = "function";
      } else {
        typeInfo = "variable";
      }
    }
    
    console.log(`- ${symbol} [${typeInfo}]`);
  });
  
  console.log("\nUsage:");
  console.log(`To import these symbols: (import [${exports.length > 0 ? exports[0] + ", ..." : "symbol"}] from "${moduleName}")`);
  console.log(`To see a specific symbol definition: :see ${moduleName}:<symbol-name>`);
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

  // Calculate appropriate indentation for next line
  const getIndentation = (): string => {
    if (!state.multilineMode) return "";
    
    const lastLine = state.multilineInput.split("\n").pop() || "";
    
    // Extract current indentation level
    const currentIndent = lastLine.match(/^(\s*)/)?.[1] || "";
    
    // Check if we need additional indentation for a new block
    const shouldIndentMore = (
      lastLine.trim().endsWith("(") || 
      lastLine.includes("(let ") || 
      lastLine.includes("(fn ") || 
      lastLine.includes("(defn ") || 
      lastLine.includes("(if ") ||
      lastLine.includes("(when ") ||
      lastLine.includes("(do ")
    );
    
    return shouldIndentMore 
      ? currentIndent + "  " // Add two spaces for deeper nesting
      : currentIndent;       // Maintain current indentation
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
      
      // If in multiline mode and Enter is pressed, auto-indent the next line
      if (state.multilineMode) {
        // Return current input plus automatic indentation for continuation
        const indent = getIndentation();
        if (currentInput.trim() && (history.length === 0 || history[history.length - 1] !== currentInput)) {
          // Only add non-empty lines to history
          history.push(currentInput);
        }
        return { text: currentInput, fromHistory: historyNavigated, controlD: false, indent };
      }
      
      if (currentInput.trim() && (history.length === 0 || history[history.length - 1] !== currentInput)) {
        history.push(currentInput);
      }
      return { text: currentInput, fromHistory: historyNavigated, controlD: false };
    } else if (key?.key === "backspace") {
      if (cursorPos > 0) {
        // Handle backspace at start of indentation specially
        if (state.multilineMode && cursorPos <= 2 && /^\s{1,2}$/.test(currentInput.slice(0, cursorPos))) {
          // If it's just indentation, remove it all at once
          currentInput = currentInput.slice(cursorPos);
          cursorPos = 0;
        } else {
          currentInput = currentInput.slice(0, cursorPos - 1) + currentInput.slice(cursorPos);
          cursorPos--;
        }
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
      // Smarter tab handling - insert spaces at beginning of line or simply insert 2 spaces
      if (cursorPos === 0 || /^\s*$/.test(currentInput.slice(0, cursorPos))) {
        // At beginning of line or only whitespace before cursor, insert 2 spaces
        currentInput = currentInput.slice(0, cursorPos) + "  " + currentInput.slice(cursorPos);
        cursorPos += 2;
      } else {
        // In the middle of code, just insert 2 spaces
        currentInput = currentInput.slice(0, cursorPos) + "  " + currentInput.slice(cursorPos);
        cursorPos += 2;
      }
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
    // Apply indentation if provided
    const lineToAdd = lineResult.indent && !lineResult.fromHistory
      ? lineResult.indent + lineResult.text
      : lineResult.text;
      
    // Append the line to multiline input
    state.multilineInput += lineResult.fromHistory ? lineToAdd : lineToAdd + "\n";
    
    // Check if we're done with multiline input
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
      
      try {
        // Get the current module
        const currentModule = evaluator.getCurrentModuleSync();
        
        // Use our proper module-aware check to only look within the current module
        const symbolExists = await evaluator.symbolExistsInModule(funcName, currentModule);
        
        if (symbolExists) {
          console.log(`Symbol '${funcName}' already exists in module '${currentModule}'. Overwrite? (y/n)`);
          
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
      } catch (err) {
        // If there's an error checking for the symbol, just proceed with normal evaluation
        console.error(`Error checking for symbol: ${err instanceof Error ? err.message : String(err)}`);
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
    case "help": {
      // Make sure we're properly passing args to commandHelp
      const helpArg = args.trim();
      commandHelp(helpArg, options.useColors);
      break;
    }
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
    case "module":
      await commandModule(evaluator, state, args);
      break;
    case "modules":
      await commandModules(evaluator, options.useColors);
      break;
    case "list":
      await commandList(evaluator, options.useColors);
      break;
    case "see":
      await commandSee(evaluator, args, options.useColors, options.showJs);
      break;
    case "remove":
      await commandRemove(evaluator, args, options.useColors, state);
      break;
    case "write":
    case "edit": // Support both for backward compatibility
      await commandWrite(evaluator, args, options, state);
      break;
    default:
      if (cmd === "js") {
        commandJs(options.showJs, options.replState.setShowJs);
      } else if (cmd === "verbose") {
        commandVerbose(options.logger, options.replState.setVerbose);
      } else if (cmd === "ast") {
        commandAst(options.showAst, options.replState.setShowAst);
      } else if (cmd === "expanded") {
        commandExpanded(options.showExpanded, options.replState.setShowExpanded);
      } else if (cmd === "colors") {
        options.replState.setColors(!options.useColors);
        console.log(`ANSI colors ${!options.useColors ? 'enabled' : 'disabled'}`);
      } else if (cmd === "reset") {
        // Redirect reset to remove all for backward compatibility
        console.log(colorText("Note: The :reset command is deprecated.", colors.fg.yellow, options.useColors));
        console.log("Using :remove all instead...");
        await commandRemove(evaluator, "all", options.useColors, state);
      } else {
        commandDefault(cmd);
      }
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
    
    // Initialize the evaluator - this is crucial
    await evaluator.initialize();
    
    // Store evaluator in global state for consistent access
    (globalThis as any).__HQL_ACTIVE_EVALUATOR = evaluator;
    
    // Ensure the evaluator is fully initialized and synchronized to the "user" module
    await evaluator.switchModule("user");
    
    // Initialize with current module from evaluator - use the sync version since we just initialized
    replStateObj.currentModule = evaluator.getCurrentModuleSync();
    
    // Store the REPL state in global for access from other components
    (globalThis as any).__HQL_REPL_STATE = replStateObj;
    
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
        
        // Await the result of handling the line
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

// Create a function for detailed help documentation
function getDetailedHelp(command: string, useColors: boolean): string {
  const commandColor = useColors ? colors.fg.sicpRed : "";
  const headerColor = useColors ? colors.fg.sicpPurple + colors.bright : "";
  const textColor = useColors ? colors.fg.white : "";
  const exampleColor = useColors ? colors.fg.lightGreen : "";
  const reset = useColors ? colors.reset : "";
  
  // Remove any leading colon (in case it wasn't stripped by commandHelp)
  if (command.startsWith(':')) {
    command = command.substring(1);
  }
  
  // If the command is "reset", redirect to "remove"
  if (command === "reset") {
    command = "remove";
    console.log(colorText("Note: The :reset command is deprecated.", colors.fg.yellow, useColors));
    console.log("Please use :remove all or :remove all:symbols instead.\n");
  }
  
  // If the command is "edit", redirect to "write"
  if (command === "edit") {
    console.log(colorText("Note: The :edit command has been renamed to :write for better clarity.", colors.fg.yellow, useColors));
    console.log("Both commands continue to work the same way.\n");
    command = "write";
  }
  
  const helpTopics: Record<string, string[]> = {
    "help": [
      `${headerColor}Command: ${commandColor}:help${reset}`,
      ``,
      `${textColor}Display help information for REPL commands.${reset}`,
      ``,
      `${headerColor}Usage:${reset}`,
      `  ${commandColor}:help${textColor} - Show the main help banner${reset}`,
      `  ${commandColor}:help <command>${textColor} - Show detailed help for a specific command${reset}`,
      `  ${commandColor}:help :<command>${textColor} - Also supported (with or without colon)${reset}`,
      ``,
      `${headerColor}Examples:${reset}`,
      `  ${exampleColor}:help see${textColor} - Display detailed help for the :see command${reset}`,
      `  ${exampleColor}:help :see${textColor} - Same as above, both formats work${reset}`,
      `  ${exampleColor}:help module${textColor} - Display detailed help for the :module command${reset}`
    ],
    
    "quit": [
      `${headerColor}Command: ${commandColor}:quit${textColor} or ${commandColor}:exit${reset}`,
      ``,
      `${textColor}Exit the REPL and return to the command line.${reset}`,
      ``,
      `${headerColor}Usage:${reset}`,
      `  ${commandColor}:quit${reset}`,
      `  ${commandColor}:exit${reset}`
    ],
    
    "exit": [
      `${headerColor}Command: ${commandColor}:quit${textColor} or ${commandColor}:exit${reset}`,
      ``,
      `${textColor}Exit the REPL and return to the command line.${reset}`,
      ``,
      `${headerColor}Usage:${reset}`,
      `  ${commandColor}:quit${reset}`,
      `  ${commandColor}:exit${reset}`
    ],
    
    "env": [
      `${headerColor}Command: ${commandColor}:env${reset}`,
      ``,
      `${textColor}Display the current environment bindings (global variables and functions).${reset}`,
      ``,
      `${headerColor}Usage:${reset}`,
      `  ${commandColor}:env${reset}`
    ],
    
    "macros": [
      `${headerColor}Command: ${commandColor}:macros${reset}`,
      ``,
      `${textColor}List all defined macros in the REPL environment.${reset}`,
      ``,
      `${headerColor}Usage:${reset}`,
      `  ${commandColor}:macros${reset}`
    ],
    
    "module": [
      `${headerColor}Command: ${commandColor}:module${reset}`,
      ``,
      `${textColor}Create a new module or switch to an existing module.${reset}`,
      `${textColor}Modules provide namespace isolation for your definitions.${reset}`,
      ``,
      `${headerColor}Usage:${reset}`,
      `  ${commandColor}:module${textColor} - Show the current module${reset}`,
      `  ${commandColor}:module <name>${textColor} - Create or switch to the specified module${reset}`,
      ``,
      `${headerColor}Examples:${reset}`,
      `  ${exampleColor}:module math${textColor} - Create (if new) or switch to the "math" module${reset}`,
      `  ${exampleColor}:module user${textColor} - Switch back to the default "user" module${reset}`,
      ``,
      `${headerColor}Notes:${reset}`,
      `  - New modules are created automatically when you switch to them${reset}`,
      `  - The default module is named "user"${reset}`,
      `  - Your current module appears in the prompt: ${exampleColor}hql[module]>${reset}`,
      `  - Use ${commandColor}:modules${textColor} to see a list of all available modules${reset}`
    ],
    
    "modules": [
      `${headerColor}Command: ${commandColor}:modules${reset}`,
      ``,
      `${textColor}List all available modules in the REPL.${reset}`,
      ``,
      `${headerColor}Usage:${reset}`,
      `  ${commandColor}:modules${reset}`,
      ``,
      `${headerColor}Related commands:${reset}`,
      `  ${commandColor}:module${textColor} - Switch to a specific module${reset}`,
      `  ${commandColor}:see${textColor} - View module contents${reset}`,
      `  ${commandColor}:remove module:<name>${textColor} - Delete a module${reset}`
    ],
    
    "list": [
      `${headerColor}Command: ${commandColor}:list${reset}`,
      ``,
      `${textColor}List all symbols defined in the current module.${reset}`,
      ``,
      `${headerColor}Usage:${reset}`,
      `  ${commandColor}:list${reset}`,
      ``,
      `${headerColor}Related commands:${reset}`,
      `  ${commandColor}:see${textColor} - View detailed information about modules and symbols${reset}`
    ],
    
    "see": [
      `${headerColor}Command: ${commandColor}:see${reset}`,
      ``,
      `${textColor}Inspect modules and symbols, showing their definitions and details.${reset}`,
      ``,
      `${headerColor}Usage:${reset}`,
      `  ${commandColor}:see${textColor} - Show all symbols and exports in the current module${reset}`,
      `  ${commandColor}:see <symbol>${textColor} - Show a specific symbol in the current module${reset}`,
      `  ${commandColor}:see exports${textColor} - Show all exports from the current module${reset}`,
      `  ${commandColor}:see all${textColor} - Show all information across all modules${reset}`,
      `  ${commandColor}:see all:modules${textColor} - Show all module names in the system${reset}`,
      `  ${commandColor}:see all:symbols${textColor} - Show all symbols across all modules${reset}`,
      `  ${commandColor}:see <module>${textColor} - Show all symbols and exports in a specific module${reset}`,
      `  ${commandColor}:see <module>:<symbol>${textColor} - Show a specific symbol in a specific module${reset}`,
      `  ${commandColor}:see <module>:exports${textColor} - Show exports from a specific module${reset}`,
      ``,
      `${headerColor}Examples:${reset}`,
      `  ${exampleColor}:see${textColor} - Show all symbols in the current module${reset}`,
      `  ${exampleColor}:see add${textColor} - Show the definition of "add" in the current module${reset}`,
      `  ${exampleColor}:see exports${textColor} - Show all exports from the current module${reset}`,
      `  ${exampleColor}:see all${textColor} - Show information about all modules${reset}`,
      `  ${exampleColor}:see math${textColor} - Show all symbols in the "math" module${reset}`,
      `  ${exampleColor}:see math:multiply${textColor} - Show the definition of "multiply" in the "math" module${reset}`,
      `  ${exampleColor}:see math:exports${textColor} - Show all exports from the "math" module${reset}`
    ],
    
    "remove": [
      `${headerColor}Command: ${commandColor}:remove${reset}`,
      ``,
      `${textColor}Remove symbols, modules, or reset the environment.${reset}`,
      `${textColor}All remove operations require confirmation for safety.${reset}`,
      ``,
      `${headerColor}Usage:${reset}`,
      `  ${commandColor}:remove <symbol>${textColor} - Remove a symbol from the current module${reset}`,
      `  ${commandColor}:remove module:<name>${textColor} - Remove an entire module${reset}`,
      `  ${commandColor}:remove <module>:<symbol>${textColor} - Remove a symbol from a specific module${reset}`,
      `  ${commandColor}:remove all${textColor} - Reset the entire environment (previously :reset)${reset}`,
      `  ${commandColor}:remove all:symbols${textColor} - Clear all symbols but keep module structure${reset}`,
      `  ${commandColor}:remove all:modules${textColor} - Remove all modules except the current one${reset}`,
      ``,
      `${headerColor}Examples:${reset}`,
      `  ${exampleColor}:remove add${textColor} - Remove the "add" symbol from the current module${reset}`,
      `  ${exampleColor}:remove module:math${textColor} - Remove the entire "math" module${reset}`,
      `  ${exampleColor}:remove math:multiply${textColor} - Remove "multiply" from the "math" module${reset}`,
      `  ${exampleColor}:remove all${textColor} - Reset the entire environment${reset}`,
      ``,
      `${headerColor}Notes:${reset}`,
      `  - The command validates that modules and symbols exist before asking for confirmation${reset}`,
      `  - The ${commandColor}module:${textColor} prefix is required when removing a module to prevent ambiguity${reset}`,
      `    If you had both a module named "math" and a symbol named "math", ${commandColor}:remove math${reset}`,
      `    would be ambiguous without the prefix.${reset}`,
      `  - The default "user" module cannot be removed${reset}`,
      `  - All operations require confirmation (type 'y' or 'yes')${reset}`,
      `  - These operations cannot be undone${reset}`
    ],
    
    "js": [
      `${headerColor}Command: ${commandColor}:js${reset}`,
      ``,
      `${textColor}Toggle the display of JavaScript transpiled code.${reset}`,
      `${textColor}When enabled, you'll see the JavaScript transpilation of each HQL expression.${reset}`,
      ``,
      `${headerColor}Usage:${reset}`,
      `  ${commandColor}:js${textColor} - Toggle JavaScript display on/off${reset}`,
      ``,
      `${headerColor}Notes:${reset}`,
      `  - This only affects the display, not the execution of code`,
      `  - When enabled, symbol definitions shown with :see will include JS code`
    ],
    
    "write": [
      `${headerColor}Command: ${commandColor}:write${reset}`,
      ``,
      `${textColor}Open a text editor for writing multiline HQL code.${reset}`,
      `${textColor}This provides a comfortable environment for writing complex code.${reset}`,
      ``,
      `${headerColor}Usage:${reset}`,
      `  ${commandColor}:write${textColor} - Open an editor with a blank file${reset}`,
      `  ${commandColor}:write <symbol>${textColor} - Edit an existing function or variable${reset}`,
      ``,
      `${headerColor}Examples:${reset}`,
      `  ${exampleColor}:write${textColor} - Open the editor for writing new code${reset}`,
      `  ${exampleColor}:write factorial${textColor} - Edit the existing 'factorial' function${reset}`,
      ``,
      `${headerColor}Notes:${reset}`,
      `  - Uses your EDITOR or VISUAL environment variable (defaults to vi)${reset}`,
      `  - The code will be evaluated when you exit the editor${reset}`,
      `  - Lines starting with semicolons (;) are treated as comments${reset}`,
      `  - The command ${commandColor}:edit${textColor} is an alias for ${commandColor}:write${textColor} and works the same way${reset}`
    ]
  };
  
  // If the command is not found, provide a list of available commands
  if (!command || !helpTopics[command]) {
    return [
      `${headerColor}Available Help Topics:${reset}`,
      ``,
      `Use ${commandColor}:help <topic>${textColor} for detailed information on a specific command.${reset}`,
      ``,
      `${textColor}Available topics: ${Object.keys(helpTopics).filter(k => !['exit', 'quit'].includes(k)).join(', ')}${reset}`
    ].join('\n');
  }
  
  return helpTopics[command].join('\n');
}

// Helper function to get the user's preferred editor
function getPreferredEditor(): string {
  return Deno.env.get("EDITOR") || Deno.env.get("VISUAL") || "vi";
}

// Command to open a temporary file for multiline editing
async function commandWrite(evaluator: ModuleAwareEvaluator, args: string, options: ProcessOptions, state: ReplState): Promise<void> {
  // Function content remains the same as commandEdit
  const tempDir = await Deno.makeTempDir({ prefix: "hql-repl-" });
  const tempFile = `${tempDir}/temp-edit.hql`;
  
  // Initial content for the file - either existing code or a template
  let initialContent = "";
  
  if (args.trim()) {
    // If a symbol name is provided, try to get its source
    try {
      const symbolName = args.trim();
      const definition = evaluator.getSymbolDefinition(symbolName);
      
      if (definition && definition.source) {
        // Use the source code if available
        initialContent = definition.source;
        
        // Handle escaped newlines
        if (initialContent.includes("\\n")) {
          initialContent = initialContent.replace(/\\n/g, "\n");
          // Remove surrounding quotes if present
          if ((initialContent.startsWith('"') && initialContent.endsWith('"')) ||
              (initialContent.startsWith("'") && initialContent.endsWith("'"))) {
            initialContent = initialContent.substring(1, initialContent.length - 1);
          }
        }
      } else {
        console.log(`No source found for symbol '${symbolName}'. Starting with an empty editor.`);
      }
    } catch (error) {
      console.error(`Error loading source: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (state.multilineMode) {
    // If we're in multiline mode, use the current multiline content
    initialContent = state.multilineInput;
  }
  
  // Add a helpful comment header
  const header = `; HQL REPL Editor
; Write your code below and save+exit when done.
; Your code will be evaluated when you return to the REPL.
;
; Current module: ${evaluator.getCurrentModule()}
;
`;
  
  try {
    // Write the initial content to the file
    await Deno.writeTextFile(tempFile, header + initialContent);
    
    // Get the editor command
    const editor = getPreferredEditor();
    
    console.log(`Opening editor (${editor})... Close the editor when finished.`);
    
    // Open the editor with the file using the newer Deno.Command API
    const command = new Deno.Command(editor, {
      args: [tempFile],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit"
    });
    
    // Execute the command and wait for it to complete
    const { code: exitCode } = await command.output();
    
    if (exitCode !== 0) {
      console.error(`Editor exited with error code: ${exitCode}`);
      return;
    }
    
    // Read the edited content
    const editedContent = await Deno.readTextFile(tempFile);
    
    // Filter out comment lines and blank lines
    const codeLines = editedContent.split('\n')
      .filter(line => !line.trim().startsWith(';') && line.trim().length > 0);
    
    if (codeLines.length === 0) {
      console.log("No code to evaluate.");
      return;
    }
    
    const hqlCode = codeLines.join('\n');
    console.log("Evaluating edited code...");
    
    // Reset multiline state
    state.multilineMode = false;
    state.multilineInput = "";
    
    // Process the code
    await processInput(hqlCode, evaluator, [], options, state);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    // Clean up the temporary directory
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch (error) {
      console.error(`Error cleaning up temporary files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}