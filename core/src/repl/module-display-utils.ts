// src/repl/module-display-utils.ts
// Utilities for displaying module and symbol information

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { colorText } from "./repl-common.ts";
import { toInternalName, toUserFacingName } from "./repl-completion.ts";
import { formatSourceCode } from "./repl-commands.ts";
import * as colors from "../utils/colors.ts";

/**
 * Format a value for pretty display
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  
  if (typeof value === 'function') {
    if (value.toString().includes('[native code]')) {
      return "[Native Function]";
    }
    
    try {
      // Try to get a clean function representation
      const fnStr = value.toString();
      // Check if this is a whole function definition or just a reference
      if (fnStr.includes("{")) {
        return fnStr.length > 100 ? fnStr.slice(0, 100) + "..." : fnStr;
      } else {
        return "[Function Reference]";
      }
    } catch (e) {
      return "[Function]";
    }
  }
  
  try {
    if (Array.isArray(value)) {
      // For arrays, limit size for display
      if (value.length > 10) {
        return `[${value.slice(0, 10).map(formatValue).join(", ")}, ... +${value.length - 10} more]`;
      }
      return `[${value.map(formatValue).join(", ")}]`;
    }
    
    if (typeof value === 'object') {
      // For objects, use JSON.stringify with limits
      const objStr = JSON.stringify(value, null, 2);
      return objStr.length > 200 ? objStr.slice(0, 200) + "\n..." : objStr;
    }
    
    // For primitives, just convert to string
    return String(value);
  } catch (e) {
    // Fallback for any errors in formatting
    return `[Object of type ${typeof value}]`;
  }
}

/**
 * Show module symbols with categorization and formatting
 */
export async function showModuleSymbols(
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
  console.log(`To see a specific symbol: :show ${moduleName}:<symbol-name>`);
  console.log(`To see only exports: :show ${moduleName}:exports`);
  if (moduleName !== evaluator.getCurrentModuleSync()) {
    console.log(`To use symbols from this module: (import [symbol1, symbol2] from "${moduleName}")`);
  }
}

/**
 * Show details for a module
 */
export async function showModuleDetails(
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
 * Show information about all modules
 */
export async function showAllModulesDetails(
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
  console.log("To see a specific module: :show <module-name>");
  console.log("To see only module names: :show all:modules");
  console.log("To see all symbols across all modules: :show all:symbols");
}

/**
 * Show only module names
 */
export async function showAllModuleNames(evaluator: ModuleAwareEvaluator, useColors: boolean): Promise<void> {
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
 * Show all symbols across all modules
 */
export async function showAllSymbols(
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
    
    // Always show the module, even if it has no symbols
    console.log(`\n${colorText(`Module: ${moduleName}`, useColors ? "\x1b[35m" : "", useColors)}`);
    console.log("-".repeat(moduleName.length + 8));
    
    if (symbols.length > 0) {
      for (const symbolName of symbols) {
        console.log(`- ${symbolName}`);
        totalSymbols++;
      }
    } else {
      console.log("(No symbols defined)");
    }
  }
  
  console.log(`\nTotal: ${totalSymbols} symbols in ${modules.length} modules`);
  
  console.log("\nUse :show <module>:<symbol> to examine a specific symbol");
  console.log("Use :show <module> to see detailed info about a module");
}

/**
 * Show exports from a module
 */
export async function showModuleExports(
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
  console.log("----------------");
  
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
  console.log(`To see a specific symbol definition: :show ${moduleName}:<symbol-name>`);
}

/**
 * Show a symbol definition
 */
export async function showSymbolDefinition(
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