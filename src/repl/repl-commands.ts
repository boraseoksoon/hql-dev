// src/repl/repl-commands.ts
// Command handlers for REPL commands

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { ReplState } from "./repl-state.ts";
import { colorText, printError, printBanner } from "./repl-ui.ts";
import { confirmAndExecute } from "./repl-input.ts";
import { getDetailedHelp, builtinDocumentation, specialFormsDocs } from "./repl-help.ts";
import { toInternalName, toUserFacingName } from "./repl-completion.ts";

/**
 * Handle the :help command
 */
export function commandHelp(args: string, useColors: boolean): void {
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
            `Error looking up ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
            useColors
          );
        }
      }
    });
    console.log("----------------");
  }
}

/**
 * Format a value for display
 */
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
    console.log("Modules:");
    console.log("---------");
    modules.forEach(moduleName => {
      const isCurrent = moduleName === evaluator.getCurrentModuleSync();
      const displayName = isCurrent 
        ? colorText(moduleName, useColors ? "\x1b[32;1m" : "", useColors) + " (current)"
        : moduleName;
      console.log(`- ${displayName}`);
    });
    console.log("---------");
  }
}

/**
 * Handle the :module command
 */
export async function commandModule(evaluator: ModuleAwareEvaluator, state: ReplState, moduleName: string): Promise<void> {
  // Check if module name is provided
  if (!moduleName) {
    // If no module name is provided, show the current module
    console.log(colorText(`Current module: ${evaluator.getCurrentModuleSync()}`, 
                         useColors ? "\x1b[35;1m" : "", true));
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

/**
 * Handle the :list command
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
    console.log(`To see details about a symbol: ${colorText(":see <symbol-name>", useColors ? "\x1b[32m" : "", useColors)}`);
  }
}

/**
 * Handle the :remove command
 */
export async function commandRemove(
  evaluator: ModuleAwareEvaluator, 
  args: string, 
  useColors: boolean, 
  state: ReplState
): Promise<void> {
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
        console.log(colorText("Environment completely reset.", useColors ? "\x1b[32m" : "", useColors));
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
        console.log(colorText("All symbols removed, module structure preserved.", useColors ? "\x1b[32m" : "", useColors));
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
            useColors ? "\x1b[32m" : "", useColors));
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
          console.log(colorText(`Module '${moduleName}' has been removed.`, useColors ? "\x1b[32m" : "", useColors));
          
          // If we removed the current module, update state
          if (state.currentModule === moduleName) {
            state.currentModule = evaluator.getCurrentModuleSync();
            console.log(colorText(`Switched to module: ${state.currentModule}`, useColors ? "\x1b[36m" : "", useColors));
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
            useColors ? "\x1b[32m" : "", useColors));
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
          useColors ? "\x1b[32m" : "", useColors));
      } else {
        console.error(`Symbol '${symbolName}' not found in module '${evaluator.getCurrentModuleSync()}'.`);
      }
    },
    useColors
  );
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

/**
 * Handle the :see command to inspect modules and symbols
 */
/**
 * Helper function to show all module details
 */
async function showModuleDetails(
  evaluator: ModuleAwareEvaluator, 
  moduleName: string, 
  useColors: boolean, 
  showJs: boolean
): Promise<void> {
  // Important: Use the passed moduleName directly, don't fetch it again from the evaluator
  // This avoids potential inconsistencies in module state
  
  const currentModule = evaluator.getCurrentModuleSync();
  const isCurrentModule = moduleName === currentModule;
  
  const symbols = await evaluator.listModuleSymbols(moduleName);
  const exports = await evaluator.getModuleExports(moduleName);
  
  // Show module header with clear indication
  if (isCurrentModule) {
    console.log(colorText(`Current Module: ${moduleName}`, useColors ? "\x1b[35;1m" : "", useColors));
  } else {
    console.log(colorText(`Module: ${moduleName}`, useColors ? "\x1b[35;1m" : "", useColors));
  }
  console.log(colorText("─".repeat(60), useColors ? "\x1b[37m" : "", useColors));
  
  if (symbols.length === 0) {
    console.log("This module contains no symbols.");
    return;
  }
  
  // Use the shared function to display module symbols
  await showModuleSymbols(evaluator, moduleName, symbols, exports, useColors, showJs);
}

/**
 * Helper function to show information about all modules
 */
async function showAllModulesDetails(
  evaluator: ModuleAwareEvaluator, 
  useColors: boolean, 
  showJs: boolean
): Promise<void> {
  const modules = await evaluator.getAvailableModules();
  const currentModule = evaluator.getCurrentModuleSync();
  
  console.log(colorText("System-wide Information (All Modules):", useColors ? "\x1b[31;1m" : "", useColors));
  console.log(colorText("─".repeat(60), useColors ? "\x1b[37m" : "", useColors));
  
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
    const currentTag = isCurrent ? colorText(" (current)", useColors ? "\x1b[36m" : "", useColors) : "";
    
    console.log(`${prefix}${colorText(moduleName, useColors ? "\x1b[35;1m" : "", useColors)}${currentTag} - ${symbolCount} symbols, ${exportCount} exports`);
  }
  
  console.log(colorText("─".repeat(60), useColors ? "\x1b[37m" : "", useColors));
  console.log("* Current module");
  
  console.log("\nUsage:");
  console.log("To see a specific module: :see <module-name>");
  console.log("To see only module names: :see all:modules");
  console.log("To see all symbols across all modules: :see all:symbols");
}

/**
 * Helper function to show only module names
 */
async function showAllModuleNames(evaluator: ModuleAwareEvaluator, useColors: boolean): Promise<void> {
  console.log(colorText("All available modules:", useColors ? "\x1b[31;1m" : "", useColors));
  
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

/**
 * Helper function to show all symbols across all modules
 */
async function showAllSymbols(
  evaluator: ModuleAwareEvaluator, 
  useColors: boolean, 
  showJs: boolean
): Promise<void> {
  console.log(colorText("All symbols across all modules:", useColors ? "\x1b[31;1m" : "", useColors));
  
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
      console.log(`\n${colorText(`Module: ${moduleName}`, useColors ? "\x1b[35m" : "", useColors)}`);
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

/**
 * Helper function to show exports from a module
 */
async function showModuleExports(
  evaluator: ModuleAwareEvaluator, 
  moduleName: string, 
  useColors: boolean
): Promise<void> {
  console.log(colorText("Module Exports:", useColors ? "\x1b[32;1m" : "", useColors));
  
  const exports = await evaluator.getModuleExports(moduleName);
  
  const isCurrentModule = moduleName === evaluator.getCurrentModuleSync();
  const title = isCurrentModule ? 
    `Exports from Current Module (${moduleName}):` : 
    `Exports from Module '${moduleName}':`;
  
  console.log(colorText(title, useColors ? "\x1b[92m" : "", useColors));
  console.log(colorText("─".repeat(60), useColors ? "\x1b[37m" : "", useColors));
  
  if (exports.length === 0) {
    console.log(`No symbols exported from module '${moduleName}'.`);
    return;
  }
  
  console.log("Exported symbols:");
  console.log("------------");
  
  const sortedExports = [...exports].sort();
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
  console.log(`To import these symbols: (import [${exports.length > 0 ? exports[0] + ", ..." : "symbol"}] from "${moduleName}")`);
  console.log(`To see a specific symbol definition: :see ${moduleName}:<symbol-name>`);
}

/**
 * Helper function to show a symbol definition
 */
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
  
  console.log(colorText(title, useColors ? "\x1b[31;1m" : "", useColors));
  console.log("----------------");
  
  // Determine if this is a function or a variable
  const isFunction = typeof definition.value === 'function';
  
  // For variables, always show the actual value first
  if (!isFunction) {
    console.log(colorText("Value:", useColors ? "\x1b[34m" : "", useColors));
    console.log(formatValue(definition.value));
    console.log("");
  }
  
  // Display the source code - prefer HQL source over JS
  if (definition.source) {
    console.log(colorText("HQL Source:", useColors ? "\x1b[32m" : "", useColors));
    const { formatSourceCode } = await import("./repl-ui.ts");
    console.log(formatSourceCode(definition.source));
  }
  
  // Only show the JS source if specifically enabled
  if (definition.jsSource && showJs) {
    console.log(colorText("\nJavaScript Transpilation:", useColors ? "\x1b[33m" : "", useColors));
    console.log(definition.jsSource);
  }
  
  // Show value if no source is available for functions
  if (!definition.source && !definition.jsSource && isFunction) {
    console.log(colorText("Function:", useColors ? "\x1b[32m" : "", useColors));
    console.log(definition.value.toString());
  }
  
  // Show metadata if available - include the full source in the metadata
  if (definition.metadata) {
    console.log(colorText("\nMetadata:", useColors ? "\x1b[94m" : "", useColors));
    console.log(definition.metadata);
  }
  
  console.log("----------------");
  
  // Show export status
  const moduleExports = await evaluator.getModuleExports(moduleName);
  const isExported = moduleExports.includes(symbolName);
  if (isExported) {
    console.log(colorText("This symbol is exported from its module.", useColors ? "\x1b[32m" : "", useColors));
  } else {
    console.log(colorText("This symbol is not exported from its module.", useColors ? "\x1b[33m" : "", useColors));
  }
  
  if (!isCurrentModule) {
    console.log("\nTo use this symbol in HQL, import it with:");
    console.log(`(import [${symbolName}] from "${moduleName}")`);
  }
  
  console.log("----------------");
}

/**
 * Command handler for :see - inspect modules and symbols
 */
export async function commandSee(
  evaluator: ModuleAwareEvaluator, 
  args: string, 
  useColors: boolean, 
  showJs: boolean = false
): Promise<void> {
  // First get the ACTUAL current module directly from the evaluator
  const currentModule = evaluator.getCurrentModuleSync();
  
  // Parse the arguments to determine what to show
  if (!args || args.trim() === "") {
    // :see - Show all information for the current module
    console.log(colorText(`Current Module: ${currentModule}`, useColors ? "\x1b[35;1m" : "", useColors));
    console.log(colorText("─".repeat(60), useColors ? "\x1b[37m" : "", useColors));
    
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

/**
 * Handle the :doc command
 */
export async function commandDoc(evaluator: ModuleAwareEvaluator, target: string, useColors: boolean): Promise<void> {
  if (!target.trim()) {
    console.log(`${useColors ? "\x1b[33m" : ""}Usage: :doc <symbol> or :doc <module>/*${useColors ? "\x1b[0m" : ""}`);
    return;
  }
  
  const symbolColor = useColors ? "\x1b[31m" : "";
  const textColor = useColors ? "\x1b[37m" : "";
  const headerColor = useColors ? "\x1b[35;1m" : "";
  const noteColor = useColors ? "\x1b[32m" : "";
  const reset = useColors ? "\x1b[0m" : "";
  
  // Check if it's a module reference (with "/*" suffix or "module:" prefix)
  if (target.endsWith("/*") || target.startsWith("module:")) {
    let moduleName: string;
    if (target.startsWith("module:")) {
      moduleName = target.substring("module:".length);
    } else {
      moduleName = target.slice(0, -2).trim();
    }
    
    try {
      // Display module documentation
      // Check if module exists
      try {
        await evaluator.switchModule(moduleName);
        // Switch back to original module
        await evaluator.switchModule(evaluator.getCurrentModuleSync());
      } catch (e) {
        console.log(`${symbolColor}Module '${moduleName}' not found.${reset}`);
        return;
      }
      
      // Get module exports
      const moduleExports = await evaluator.getModuleExports(moduleName);
      
      console.log(`${headerColor}Module: ${symbolColor}${moduleName}${reset}`);
      console.log(`${headerColor}================${reset}`);
      
      if (moduleExports && moduleExports.length > 0) {
        console.log(`${textColor}Exported symbols:${reset}`);
        
        // Group exports by type for better organization
        const functions: string[] = [];
        const variables: string[] = [];
        const macros: string[] = [];
        const other: string[] = [];
        
        for (const symbol of moduleExports) {
          try {
            // Get the symbol's documentation and type if available
            const symbolDef = await evaluator.getSymbolDefinition(symbol, moduleName);
            
            if (symbolDef && typeof symbolDef === 'object') {
              // Try to determine the symbol type
              if (symbolDef.type === 'function' || typeof symbolDef.value === 'function') {
                functions.push(symbol);
              } else if (symbolDef.type === 'macro') {
                macros.push(symbol);
              } else if (symbolDef.type === 'var' || symbolDef.value !== undefined) {
                variables.push(symbol);
              } else {
                other.push(symbol);
              }
            } else {
              other.push(symbol);
            }
          } catch (e) {
            other.push(symbol);
          }
        }
        
        // Display sorted exports by category
        if (functions.length > 0) {
          console.log(`  ${noteColor}Functions:${reset}`);
          functions.sort().forEach(fn => console.log(`    ${symbolColor}${fn}${reset}`));
        }
        
        if (macros.length > 0) {
          console.log(`  ${noteColor}Macros:${reset}`);
          macros.sort().forEach(macro => console.log(`    ${symbolColor}${macro}${reset}`));
        }
        
        if (variables.length > 0) {
          console.log(`  ${noteColor}Variables:${reset}`);
          variables.sort().forEach(v => console.log(`    ${symbolColor}${v}${reset}`));
        }
        
        if (other.length > 0) {
          console.log(`  ${noteColor}Other:${reset}`);
          other.sort().forEach(o => console.log(`    ${symbolColor}${o}${reset}`));
        }
      } else {
        console.log(`${textColor}No exported symbols.${reset}`);
      }
    } catch (error) {
      console.error(`${"\x1b[31m"}Error accessing module: ${error instanceof Error ? error.message : String(error)}${reset}`);
    }
  } else {
    // Handle symbol documentation
    try {
      // Check if it's a special form
      if (target in specialFormsDocs) {
        console.log(`${headerColor}Special Form: ${symbolColor}${target}${reset}`);
        console.log(`${headerColor}================${reset}`);
        specialFormsDocs[target].forEach(line => console.log(`${noteColor}${line}${reset}`));
        return;
      }
      
      // Check if it's a built-in function
      if (target in builtinDocumentation) {
        console.log(`${headerColor}Built-in Function: ${symbolColor}${target}${reset}`);
        console.log(`${headerColor}================${reset}`);
        console.log(`${noteColor}${builtinDocumentation[target]}${reset}`);
        return;
      }
      
      // Try to get documentation for a regular symbol
      console.log(`${headerColor}Symbol: ${symbolColor}${target}${reset}`);
      console.log(`${headerColor}================${reset}`);
      
      try {
        // Try to get the symbol definition
        const symbolDef = await evaluator.getSymbolDefinition(target);
        
        if (symbolDef) {
          // Display the type of symbol
          let symbolType = "Unknown";
          if (typeof symbolDef === 'function') {
            symbolType = "Function";
          } else if (typeof symbolDef === 'object' && symbolDef !== null) {
            if (symbolDef.metadata && typeof symbolDef.metadata === 'object' && 'type' in symbolDef.metadata) {
              symbolType = String(symbolDef.metadata.type).charAt(0).toUpperCase() + String(symbolDef.metadata.type).slice(1);
            } else if (typeof symbolDef.value === 'function') {
              symbolType = "Function";
            } else if (Array.isArray(symbolDef.value)) {
              symbolType = "List/Vector";
            } else if (typeof symbolDef.value === 'object' && symbolDef.value !== null) {
              symbolType = "Map/Object";
            } else {
              symbolType = "Variable";
            }
          }
          
          console.log(`${textColor}Type: ${symbolType}${reset}`);
          
          // Extract documentation string if available
          let docString = "";
          if (typeof symbolDef === 'object' && symbolDef !== null && 
              symbolDef.metadata && typeof symbolDef.metadata === 'object' && 
              'docstring' in symbolDef.metadata) {
            docString = String(symbolDef.metadata.docstring);
          } else if (typeof symbolDef === 'function' && 
                    'docstring' in symbolDef && symbolDef.docstring) {
            docString = String(symbolDef.docstring);
          }
          
          if (docString) {
            console.log(`${textColor}Documentation: ${noteColor}${docString}${reset}`);
          } else {
            console.log(`${textColor}No documentation available.${reset}`);
          }
          
          // Show usage example for functions
          if (symbolType === "Function") {
            let argsString = "";
            if (typeof symbolDef === 'object' && symbolDef !== null && 
                symbolDef.metadata && typeof symbolDef.metadata === 'object' && 
                'params' in symbolDef.metadata) {
              const params = symbolDef.metadata.params;
              argsString = Array.isArray(params) ? params.join(" ") : String(params);
            } else if (typeof symbolDef === 'function' && 
                      'length' in symbolDef && typeof symbolDef.length === 'number') {
              argsString = Array(symbolDef.length).fill("arg")
                .map((arg, i) => `${arg}${i+1}`).join(" ");
            }
            
            console.log(`${textColor}Usage: ${symbolColor}(${target} ${argsString})${reset}`);
          }
        } else {
          console.log(`${textColor}Symbol not found or has no documentation.${reset}`);
        }
      } catch (e) {
        console.log(`${textColor}Symbol '${target}' not found or has no documentation.${reset}`);
        console.log(`${textColor}Try using ${symbolColor}:see ${target}${textColor} for more information.${reset}`);
      }
    } catch (error) {
      console.error(`${"\x1b[31m"}Error retrieving documentation: ${error instanceof Error ? error.message : String(error)}${reset}`);
    }
  }
}

/**
 * Helper function to show module symbols
 */
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
      if (definition.metadata && typeof definition.metadata === 'object' && 'type' in definition.metadata) {
        const type = String(definition.metadata.type);
        if (type === 'functions' || type === 'function') {
          functionSymbols.push(userSymbol);
        } else {
          variableSymbols.push(userSymbol);
        }
      } else if (typeof definition.value === 'function') {
        // Fallback to checking the value type
        functionSymbols.push(userSymbol);
      } else if (Array.isArray(definition.value) || 
                typeof definition.value === 'object' && definition.value !== null) {
        variableSymbols.push(userSymbol);
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
    console.log(colorText("Functions:", useColors ? "\x1b[32;1m" : "", useColors));
    console.log("------------");
    functionSymbols.sort().forEach(symbol => {
      const isExported = exportSet.has(symbol);
      const marker = isExported ? colorText(' (exported)', useColors ? "\x1b[32m" : "", useColors) : '';
      console.log(`- ${symbol}${marker}`);
    });
  }
  
  // Display variables
  if (variableSymbols.length > 0) {
    if (functionSymbols.length > 0) console.log("");
    console.log(colorText("Variables:", useColors ? "\x1b[34;1m" : "", useColors));
    console.log("------------");
    variableSymbols.sort().forEach(symbol => {
      const isExported = exportSet.has(symbol);
      const marker = isExported ? colorText(' (exported)', useColors ? "\x1b[32m" : "", useColors) : '';
      console.log(`- ${symbol}${marker}`);
    });
  }
  
  // Display other symbols if any
  if (otherSymbols.length > 0) {
    if (functionSymbols.length > 0 || variableSymbols.length > 0) console.log("");
    console.log(colorText("Other Symbols:", useColors ? "\x1b[33;1m" : "", useColors));
    console.log("------------");
    otherSymbols.sort().forEach(symbol => {
      const isExported = exportSet.has(symbol);
      const marker = isExported ? colorText(' (exported)', useColors ? "\x1b[32m" : "", useColors) : '';
      console.log(`- ${symbol}${marker}`);
    });
  }
  
  // Show summary of exports if any
  if (exports.length > 0) {
    console.log(colorText("\nExports Summary:", useColors ? "\x1b[92;1m" : "", useColors));
    console.log("------------");
    console.log(colorText(exports.join(", "), useColors ? "\x1b[32m" : "", useColors));
  }
  
  console.log("\nUsage:");
  console.log(`To see a specific symbol: :see ${moduleName}:<symbol-name>`);
  console.log(`To see only exports: :see ${moduleName}:exports`);
  if (moduleName !== evaluator.getCurrentModuleSync()) {
    console.log(`To use symbols from this module: (import [symbol1, symbol2] from "${moduleName}")`);
  }
}