// src/repl/repl-commands.ts
// Command handlers for REPL commands

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { ReplState } from "./repl-state.ts";
import { colorText, printError, printBanner } from "./repl-ui.ts";
import { readLineWithArrowKeys } from "./repl-input.ts";
import { getDetailedHelp, builtinDocumentation, specialFormsDocs } from "./repl-help.ts";
import { toInternalName, toUserFacingName } from "./repl-completion.ts";

/**
 * Shared implementation for help commands
 */
export function showCommandHelp(command: string, useColors: boolean): void {
  if (!command || command.trim() === "") {
    // No arguments, just show the banner
    printBanner(useColors);
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
 * Print help for CLI-style commands
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
    console.log("     Use :see <module> to view module contents");
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
      const modules = await evaluator.getAvailableModules();
      if (modules.length > 0) {
        // Separate modules into core and user modules
        const coreModules = ['global', 'user'];
        const userModules = modules.filter(m => !coreModules.includes(m));
        
        console.log("Core System Modules (protected):");
        console.log("--------------------------");
        coreModules.forEach(modName => {
          if (modules.includes(modName)) {
            const isCurrent = modName === currentModule;
            const displayName = isCurrent 
              ? colorText(modName, useColors ? "\x1b[32;1m" : "", useColors) + " (current)"
              : modName;
            
            // Add special marker for global module
            const description = modName === 'global' 
              ? " - Core system module with essential functionality"
              : " - Protected system module";
              
            console.log(`- ${displayName}${colorText(description, useColors ? "\x1b[36m" : "", useColors)}`);
          }
        });
        
        if (userModules.length > 0) {
          console.log("\nUser Modules:");
          console.log("-----------");
          userModules.sort().forEach(modName => {
            const isCurrent = modName === currentModule;
            const displayName = isCurrent 
              ? colorText(modName, useColors ? "\x1b[32;1m" : "", useColors) + " (current)"
              : modName;
            console.log(`- ${displayName}`);
          });
        }
      } else {
        console.log("No modules defined yet.");
      }
    } catch (error) {
      // Silently handle errors getting modules list
    }
    
    console.log(`\nUse :go <module-name> to switch to a different module`);
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
      // Separate modules into core and user modules
      const coreModules = ['global', 'user'];
      const userModules = availableModules.filter(m => !coreModules.includes(m));
      
      console.log("\nAvailable modules:");
      console.log("Core System Modules (protected):");
      console.log("--------------------------");
      coreModules.forEach(modName => {
        if (availableModules.includes(modName)) {
          const isCurrent = modName === evaluator.getCurrentModuleSync();
          const displayName = isCurrent 
            ? colorText(modName, useColors ? "\x1b[32;1m" : "", useColors) + " (current)"
            : modName;
          console.log(`- ${displayName}`);
        }
      });
      
      if (userModules.length > 0) {
        console.log("\nUser Modules:");
        console.log("-----------");
        userModules.sort().forEach(modName => {
          const isCurrent = modName === evaluator.getCurrentModuleSync();
          const displayName = isCurrent 
            ? colorText(modName, useColors ? "\x1b[32;1m" : "", useColors) + " (current)"
            : modName;
          console.log(`- ${displayName}`);
        });
      }
      
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
    const errorMessage = error instanceof Error ? error.message : String(error);
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
    console.log(`To see details about a symbol: ${colorText(":see <symbol-name>", useColors ? "\x1b[32m" : "", useColors)}`);
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
  
  console.log("\nTip: Use `:see <module>:<symbol>` to view symbol details");
  console.log("    Use `:go <module>` to switch to a module");
}

/**
 * Simple confirmation prompt that works in the REPL environment
 */
async function confirmAction(prompt: string): Promise<boolean> {
  console.log(`${prompt} (y/N)`);
  
  // Use standard Deno prompt
  const buf = new Uint8Array(10);
  const n = await Deno.stdin.read(buf);
  
  if (n) {
    const response = new TextDecoder().decode(buf.subarray(0, n)).trim().toLowerCase();
    return response === 'y' || response === 'yes';
  }
  
  return false;
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
    console.log("  rm /               - Remove everything (all modules and symbols)");
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
      const confirmed = await confirmAction(`Are you sure you want to remove ${target === '/' ? 'EVERYTHING except core modules' : 'all symbols in current module'}?`);
      if (!confirmed) {
        console.log('Operation cancelled.');
        return;
      }
    }

    if (target === '/') {
      // Remove everything - all modules except global and user
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
      
      if (removedCount > 0) {
        console.log(`Removed ${removedCount} modules.`);
        console.log(`Note: The 'global' module was preserved as it's a protected core module.`);
        
        // Set current module back to global/user to avoid being in a removed module
        if (!protectedModules.includes(replState.currentModule)) {
          await evaluator.switchModule('global');
          replState.currentModule = 'global';
        }
      } else {
        console.log('No modules to remove.');
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

    // Force the removal to proceed
    const removed = await evaluator.removeSymbolFromModule(symbolName, moduleName);
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
    
    // Force the removal to proceed
    const removed = await evaluator.removeModule(target);
    
    if (removed) {
      console.log(`Removed module ${target}`);
      
      // If we removed the current module, switch to a valid one
      if (isCurrentModule) {
        const remainingModules = await evaluator.getAvailableModules();
        const newModule = remainingModules[0] || 'global';
        await evaluator.switchModule(newModule);
        replState.currentModule = newModule;
        console.log(`Switched to module: ${newModule}`);
      }
    } else {
      console.error(`Failed to remove module ${target}`);
    }
    
    return;
  }

  // Try to remove as a symbol from current module
  const symbols = await evaluator.listModuleSymbols();
  if (symbols.includes(target)) {
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

  // If we get here, we couldn't find what the user was trying to remove
  console.error(`Target not found: ${target}`);
  console.log('Use :modules or ls -m to see available modules.');
  console.log('Use :list or ls to see available symbols in current module.');
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

// Rest of the file with commandSee, commandDoc, showModuleSymbols, etc. remains unchanged
// (Truncated for brevity)

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