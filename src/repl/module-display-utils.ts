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
  console.log(`To see a specific symbol: :see ${moduleName}:<symbol-name>`);
  console.log(`To see only exports: :see ${moduleName}:exports`);
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
  console.log("To see a specific module: :see <module-name>");
  console.log("To see only module names: :see all:modules");
  console.log("To see all symbols across all modules: :see all:symbols");
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
  console.log(`To see a specific symbol definition: :see ${moduleName}:<symbol-name>`);
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
  // Format the title with module context
  const titleText = `${symbolName} (from module '${moduleName}')`;
  console.log(colorText(`Definition of ${titleText}:`, useColors ? "\x1b[35;1m" : "", useColors));
  console.log(colorText("─".repeat(60), useColors ? "\x1b[37m" : "", useColors));
  
  // Format value representation differently based on type
  if (definition.value !== undefined) {
    const value = definition.value;
    
    // Check if this is an external module from npm/http
    const isExternalModule = 
      definition.metadata?.note?.includes("runtime environment") ||
      (definition.metadata?.source && (
        definition.metadata.source.includes('from "npm:') ||
        definition.metadata.source.includes('from "http') ||
        definition.metadata.source.includes('from "jsr:')
      ));
    
    // Special handling for external modules
    if (isExternalModule && 
        (typeof value === 'object' || typeof value === 'function') && 
        value !== null) {
      // Display module information using the specialized function
      await showExternalModuleDetails(evaluator, symbolName, value, useColors);
      
      // Show metadata
      if (definition.metadata && typeof definition.metadata === 'object') {
        console.log(colorText(`\nModule Info:`, useColors ? "\x1b[34m" : "", useColors));
        if ('source' in definition.metadata) {
          console.log(`Import statement: ${definition.metadata.source}`);
        }
        if ('created' in definition.metadata) {
          console.log(`Imported on: ${definition.metadata.created}`);
        }
      }
      
      return;
    }
    
    // Specific handling for different types (non-external modules)
    if (typeof value === 'function') {
      // For functions, try to show the actual function code
      if (definition.jsSource && showJs) {
        // If we have JS source and the user wants to see it
        console.log(formatSourceCode(definition.jsSource));
      } else if (definition.source) {
        // Original source code
    console.log(formatSourceCode(definition.source));
      } else {
        // Just the function signature
        console.log(formatValue(value));
      }
    } else {
      // For modules and complex objects, use pretty printing with proper indentation
      try {
        if (typeof value === 'object' && value !== null) {
          // Handle circular references
          const seen = new WeakSet();
          const replacer = (key: string, val: any) => {
            // Basic handling for special types
            if (val === undefined) return 'undefined';
            if (val === null) return null;
            if (typeof val === 'function') return `[Function: ${val.name || 'anonymous'}]`;
            
            // Check for circular references
            if (typeof val === 'object' && val !== null) {
              if (seen.has(val)) {
                return '[Circular]';
              }
              seen.add(val);
              
              // Special handling for common objects
              if (val instanceof Date) {
                return val.toISOString();
              }
              
              if (val instanceof RegExp) {
                return val.toString();
              }
            }
            return val;
          };
          
          // Try to pretty print as JSON with custom replacer
          try {
            const jsonStr = JSON.stringify(value, replacer, 2);
            // Apply syntax highlighting if colors are enabled
            if (useColors) {
              const highlightedJson = jsonStr
                .replace(/"([^"]+)":/g, `"${colors.fg.green}$1${colors.reset}":`)
                .replace(/: "([^"]+)"/g, `: "${colors.fg.cyan}$1${colors.reset}"`)
                .replace(/: (\d+)/g, `: ${colors.fg.yellow}$1${colors.reset}`)
                .replace(/: (true|false)/g, `: ${colors.fg.magenta}$1${colors.reset}`);
              console.log(highlightedJson);
            } else {
              console.log(jsonStr);
            }
          } catch (error) {
            // If JSON.stringify fails (e.g., circular references), use simpler output
            console.log(formatValue(value));
          }
        } else {
          // For primitives, use formatValue
          console.log(formatValue(value));
        }
      } catch (error) {
        // Fallback for any errors
        console.log(formatValue(value));
      }
    }
    
    // Show additional metadata if available
    if (definition.metadata && typeof definition.metadata === 'object') {
      if ('type' in definition.metadata) {
        console.log(colorText(`\nType: ${definition.metadata.type}`, useColors ? "\x1b[34m" : "", useColors));
      }
      
      if ('created' in definition.metadata) {
        console.log(colorText(`Created: ${definition.metadata.created}`, useColors ? "\x1b[34m" : "", useColors));
      }
      
      if ('exported' in definition.metadata && definition.metadata.exported) {
        console.log(colorText(`Exported: yes`, useColors ? "\x1b[32m" : "", useColors));
      }
    }
    
    // Check if this symbol is exported directly 
    if (!(definition.metadata && definition.metadata.exported)) {
      const exports = await evaluator.getModuleExports(moduleName);
      const userFacingExports = exports.map(toUserFacingName);
      const isExported = userFacingExports.includes(toUserFacingName(symbolName));
      
  if (isExported) {
        console.log(colorText(`\nThis symbol is exported from module '${moduleName}'.`, useColors ? "\x1b[32m" : "", useColors));
      }
    }
  } else {
    // Handle case where we don't have a value
    console.log(`Symbol exists but has no stored value.`);
  }
  
  // Show usage information  
  if (moduleName !== evaluator.getCurrentModuleSync()) {
    console.log(colorText(`\nTo use this symbol in current module:`, useColors ? "\x1b[36m" : "", useColors));
    console.log(`(import [${symbolName}] from "${moduleName}")`);
  }
}

/**
 * Show detailed information about a specific module property
 */
export async function showModulePropertyDetails(
  value: any,
  propertyName: string,
  useColors: boolean
): Promise<void> {
  console.log(colorText(`\nProperty: ${propertyName}`, useColors ? "\x1b[36;1m" : "", useColors));
  
  // Format and display the property value
  try {
    if (typeof value === 'function') {
      // For functions, show the signature
      const fnStr = value.toString();
      if (fnStr.length > 200) {
        // Show truncated function
        console.log(fnStr.slice(0, 200) + '...');
      } else {
        console.log(fnStr);
      }
      
      // If function has prototype properties, show them too
      if (value.prototype && typeof value.prototype === 'object') {
        console.log(colorText('\nPrototype properties:', useColors ? "\x1b[34m" : "", useColors));
        const protoProps = Object.getOwnPropertyNames(value.prototype).filter(p => p !== 'constructor');
        if (protoProps.length > 0) {
          console.log(`- ${protoProps.join('\n- ')}`);
        }
      }
    } 
    else if (typeof value === 'object' && value !== null) {
      // For objects, show JSON representation with proper indentation
      const seen = new WeakSet();
      const replacer = (key: string, val: any) => {
        if (val === undefined) return 'undefined';
        if (val === null) return null;
        if (typeof val === 'function') return `[Function: ${val.name || 'anonymous'}]`;
        
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) return '[Circular]';
          seen.add(val);
          
          if (val instanceof Date) return val.toISOString();
          if (val instanceof RegExp) return val.toString();
        }
        return val;
      };
      
      try {
        // Limit depth for display
        const jsonStr = JSON.stringify(value, replacer, 2);
        if (jsonStr.length > 1000) {
          console.log(jsonStr.slice(0, 1000) + '...\n[Output truncated]');
        } else {
          console.log(jsonStr);
        }
      } catch (error) {
        // Simple object display as fallback
        console.log(`[Object with properties: ${Object.keys(value).join(', ')}]`);
      }
    }
    else {
      // Primitives
      console.log(value);
    }
  } catch (error) {
    console.log(`[Error displaying property: ${error instanceof Error ? error.message : String(error)}]`);
  }
}

/**
 * Display detailed information about a npm/external module
 */
export async function showExternalModuleDetails(
  evaluator: ModuleAwareEvaluator,
  moduleName: string,
  moduleValue: any, 
  useColors: boolean
): Promise<void> {
  if (typeof moduleValue !== 'object' && typeof moduleValue !== 'function') {
    console.log(`${moduleName} is not a module object or function.`);
    return;
  }
  
  console.log(colorText(`Module Properties:`, useColors ? "\x1b[35;1m" : "", useColors));
  console.log(colorText("─".repeat(60), useColors ? "\x1b[37m" : "", useColors));
  
  try {
    // If module is a function with properties (like Express)
    if (typeof moduleValue === 'function') {
      console.log(colorText(`${moduleName} is a function with the following properties:`, useColors ? "\x1b[36m" : "", useColors));
      
      // Show function signature
      console.log(colorText(`\nFunction Signature:`, useColors ? "\x1b[33m" : "", useColors));
      const fnStr = moduleValue.toString();
      console.log(fnStr.length > 200 ? fnStr.slice(0, 200) + '...' : fnStr);
      
      // Get function properties
      const functionProps = Object.getOwnPropertyNames(moduleValue)
        .filter(p => p !== 'length' && p !== 'name' && p !== 'prototype');
      
      if (functionProps.length > 0) {
        console.log(colorText(`\nFunction Properties:`, useColors ? "\x1b[33m" : "", useColors));
        functionProps.forEach(prop => {
          try {
            const propValue = (moduleValue as any)[prop];
            const typeName = typeof propValue;
            console.log(`- ${prop} [${typeName}]`);
          } catch (e) {
            console.log(`- ${prop} [access error]`);
          }
        });
      }
      
      // Show prototype methods if available
      if (moduleValue.prototype && typeof moduleValue.prototype === 'object') {
        const protoProps = Object.getOwnPropertyNames(moduleValue.prototype)
          .filter(p => p !== 'constructor');
        
        if (protoProps.length > 0) {
          console.log(colorText(`\nPrototype Methods:`, useColors ? "\x1b[33m" : "", useColors));
          protoProps.forEach(prop => {
            try {
              const propValue = moduleValue.prototype[prop];
              const typeName = typeof propValue;
              console.log(`- ${prop} [${typeName}]`);
            } catch (e) {
              console.log(`- ${prop} [access error]`);
            }
          });
        }
      }
    } 
    // If module is an object with properties
    else if (typeof moduleValue === 'object' && moduleValue !== null) {
      const props = Object.getOwnPropertyNames(moduleValue);
      
      // Group properties by type for better organization
      const methods: string[] = [];
      const objects: string[] = [];
      const primitives: string[] = [];
      
      props.forEach(prop => {
        try {
          const value = (moduleValue as any)[prop];
          if (typeof value === 'function') {
            methods.push(prop);
          } else if (typeof value === 'object' && value !== null) {
            objects.push(prop);
          } else {
            primitives.push(prop);
          }
        } catch (e) {
          // Ignore properties that can't be accessed
        }
      });
      
      // Show methods
      if (methods.length > 0) {
        console.log(colorText(`Methods:`, useColors ? "\x1b[32;1m" : "", useColors));
        methods.sort().forEach(method => console.log(`- ${method}`));
        console.log();
      }
      
      // Show objects
      if (objects.length > 0) {
        console.log(colorText(`Objects/Namespaces:`, useColors ? "\x1b[34;1m" : "", useColors));
        objects.sort().forEach(obj => console.log(`- ${obj}`));
        console.log();
      }
      
      // Show primitives
      if (primitives.length > 0) {
        console.log(colorText(`Properties:`, useColors ? "\x1b[33;1m" : "", useColors));
        primitives.sort().forEach(prop => {
          try {
            const value = (moduleValue as any)[prop];
            console.log(`- ${prop}: ${value}`);
          } catch (e) {
            console.log(`- ${prop}: [access error]`);
          }
        });
      }
    }
    
    // Show usage examples
    console.log(colorText(`\nUsage Examples:`, useColors ? "\x1b[36;1m" : "", useColors));
    
    // Check if this is a chalk-like module
    const isChalk = moduleName.toLowerCase().includes('chalk') || 
                   (moduleValue.colors && Array.isArray(moduleValue.colors) && 
                    moduleValue.colors.includes('green'));
    
    if (isChalk) {
      // Show chalk-specific examples
      const exampleColor = moduleValue.colors && moduleValue.colors.length > 0 
        ? moduleValue.colors[0] 
        : 'green';
      
      // Determine the correct usage pattern based on the module structure
      if (moduleValue.default && typeof moduleValue.default === 'function') {
        // ESM-style chalk with default export
        console.log(`// For default export usage:`);
        console.log(`(${moduleName}.default "Hello world")`);
        console.log(`(${moduleName}.default.${exampleColor} "Colored text")`);
      } else if (typeof moduleValue === 'function') {
        // Function-style chalk
        console.log(`(${moduleName} "Hello world")`);
        console.log(`(${moduleName}.${exampleColor} "Colored text")`);
      } else {
        // For object-style chalk with color methods directly on the object
        if (moduleValue.colors && moduleValue.colors.length > 0) {
          const colorMethod = exampleColor;
          console.log(`// Access color methods directly:`);
          console.log(`(${moduleName}.${colorMethod} "Colored text")`);
        }
        // For chalk with a Chalk class constructor
        if (moduleValue.Chalk && typeof moduleValue.Chalk === 'function') {
          console.log(`// Using the Chalk class constructor:`);
          console.log(`(def myChalk (new ${moduleName}.Chalk))`);
          console.log(`(myChalk.${exampleColor} "Colored text")`);
        }
      }
    } else if (typeof moduleValue === 'function') {
      console.log(`(${moduleName})`);
      
      // If it's likely Express, show a typical Express example
      if (moduleName.toLowerCase().includes('express')) {
        console.log(`\n// Create Express app:`);
        console.log(`(def app (${moduleName}))`);
        console.log(`(app.get "/" (fn [req res] (res.send "Hello World")))`);
      }
    } else {
      // Get one method as example if available
      const methods = Object.getOwnPropertyNames(moduleValue)
        .filter(prop => typeof (moduleValue as any)[prop] === 'function');
      
      if (methods.length > 0) {
        const exampleMethod = methods[0];
        console.log(`(${moduleName}.${exampleMethod})`);
      } else {
        console.log(`(${moduleName}.<property>)`);
      }
    }
    
    console.log(`\nTo see details for a specific property:`);
    console.log(`(${moduleName}.<property>)`);
  } catch (error) {
    console.log(`Error displaying module details: ${error instanceof Error ? error.message : String(error)}`);
  }
}