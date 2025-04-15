// src/repl/doc-command.ts
// Documentation command for the REPL

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { formatErrorMessage } from "../../core/src/common/common-utils.ts";
import { builtinDocumentation, specialFormsDocs } from "./repl-help.ts";


/**
 * Handle the :doc command to show documentation for a symbol or module
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
              if (symbolDef.metadata?.type === 'function' || typeof symbolDef.value === 'function') {
                functions.push(symbol);
              } else if (symbolDef.metadata?.type === 'macro') {
                macros.push(symbol);
              } else if (symbolDef.metadata?.type === 'variable' || symbolDef.value !== undefined) {
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
      console.error(`${"\x1b[31m"}Error accessing module: ${formatErrorMessage(error)}${reset}`);
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
          if (typeof symbolDef.value === 'function') {
            symbolType = "Function";
          } else if (typeof symbolDef === 'object' && symbolDef !== null) {
            if (symbolDef.metadata && typeof symbolDef.metadata === 'object' && symbolDef.metadata.type) {
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
          if (symbolDef.metadata && typeof symbolDef.metadata === 'object' && 
              'docstring' in symbolDef.metadata) {
            docString = String(symbolDef.metadata.docstring);
          } else if (typeof symbolDef.value === 'function' && 
                    symbolDef.value.docstring) {
            docString = String(symbolDef.value.docstring);
          }
          
          if (docString) {
            console.log(`${textColor}Documentation: ${noteColor}${docString}${reset}`);
          } else {
            console.log(`${textColor}No documentation available.${reset}`);
          }
          
          // Show usage example for functions
          if (symbolType === "Function") {
            let argsString = "";
            if (symbolDef.metadata && typeof symbolDef.metadata === 'object' && 
                'params' in symbolDef.metadata) {
              const params = symbolDef.metadata.params;
              argsString = Array.isArray(params) ? params.join(" ") : String(params);
            } else if (typeof symbolDef.value === 'function' && 
                      typeof symbolDef.value.length === 'number') {
              argsString = Array(symbolDef.value.length).fill("arg")
                .map((arg, i) => `${arg}${i+1}`).join(" ");
            }
            
            console.log(`${textColor}Usage: ${symbolColor}(${target} ${argsString})${reset}`);
          }
        } else {
          console.log(`${textColor}Symbol not found or has no documentation.${reset}`);
        }
      } catch (e) {
        console.log(`${textColor}Symbol '${target}' not found or has no documentation.${reset}`);
        console.log(`${textColor}Try using ${symbolColor}:show ${target}${textColor} for more information.${reset}`);
      }
    } catch (error) {
      console.error(`${"\x1b[31m"}Error retrieving documentation: ${formatErrorMessage(error)}${reset}`);
    }
  }
}