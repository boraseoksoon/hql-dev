// src/repl/show-command.ts
// Implementation of the :show command for inspecting modules and symbols

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { toInternalName, toUserFacingName } from "./repl-completion.ts";
import { colorText } from "./repl-common.ts";
import {
  showModuleSymbols,
  showModuleDetails,
  showAllModulesDetails,
  showAllModuleNames,
  showAllSymbols,
  showModuleExports,
  showSymbolDefinition
} from "./module-display-utils.ts";

/**
 * Command handler for :show - inspect modules and symbols
 */
export async function commandShow(
  evaluator: ModuleAwareEvaluator, 
  args: string, 
  useColors: boolean, 
  showJs: boolean = false
): Promise<void> {
  // First get the ACTUAL current module directly from the evaluator
  const currentModule = evaluator.getCurrentModuleSync();
  
  // Parse the arguments to determine what to show
  if (!args || args.trim() === "") {
    // :show - Show all information for the current module
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
    // :show all - Show all information across all modules
    await showAllModulesDetails(evaluator, useColors, showJs);
    return;
  }
  
  if (argsText === "all:modules") {
    // :show all:modules - Show all module names
    await showAllModuleNames(evaluator, useColors);
    return;
  }
  
  if (argsText === "all:symbols") {
    // :show all:symbols - Show all symbols across all modules
    await showAllSymbols(evaluator, useColors, showJs);
    return;
  }
  
  if (argsText === "exports") {
    // :show exports - Show all exports from the current module
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
      // :show module:exports - Show exports from a specific module
      await showModuleExports(evaluator, moduleName, useColors);
      return;
    }
    
    // :show module:symbol - Show a specific symbol from a module
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
    // :show module-name - Show all information for a specific module
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
  
  // :show symbol-name - Show a specific symbol from current module
  // Pass the user-provided name for display purposes, even if we found it via internal name
  await showSymbolDefinition(evaluator, userSymbolName, currentModule, definition, useColors, showJs);
} 