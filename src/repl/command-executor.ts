// src/repl/command-executor.ts
// Central command execution logic for REPL

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { ReplState, resetReplState } from "./repl-state.ts";
import { Logger } from "../logger.ts";
import { 
  ReplStateHandlers, 
  CommonReplOptions, 
  printError, 
  colorText, 
  moduleUtils 
} from "./repl-common.ts";
import {
  commandHelp,
  commandQuit,
  commandEnv,
  commandMacros,
  commandModules,
  commandGo,
  commandList,
  commandRemove,
  commandVerbose,
  commandAst,
  commandExpanded,
  commandJs,
  commandFind,
  commandCli,
  printCliHelp
} from "./repl-commands.ts";
import { commandSee } from "./see-command.ts";
import { commandShow } from "./show-command.ts";
import { commandDoc } from "./doc-command.ts";

/**
 * Map of CLI command names to their REPL command equivalent
 */
const cliToReplMap: Record<string, string> = {
  "ls": "list",
  "cd": "go",
  "pwd": "pwd",
  "find": "find",
  "man": "help",
  "rm": "remove",
  "clear": "clear",
  "cls": "clear",
  "mkdir": "mkdir",
  "help": "help"
};

/**
 * Execute a command with common error handling
 */
export async function executeCommand(
  command: string,
  args: string,
  evaluator: ModuleAwareEvaluator,
  replState: ReplState,
  useColors: boolean,
  logger: Logger, 
  stateHandlers: ReplStateHandlers,
  options: CommonReplOptions
): Promise<boolean> {
  try {
    // Map CLI commands to their REPL equivalents
    if (command in cliToReplMap) {
      command = cliToReplMap[command];
    }
    
    // Special case for ls -m or ls -modules
    if (command === 'list' && (args === '-m' || args === '-modules')) {
      await commandModules(evaluator, useColors);
      return true;
    }
    
    // Special case for ls -all to show all symbols across all modules
    if (command === 'list' && args === '-all') {
      await commandSee(evaluator, 'all:symbols', useColors, options.showJs);
      return true;
    }
    
    switch (command) {
      // Help command
      case 'help':
      case 'h':
        commandHelp(args, useColors);
        return true;
        
      // Quit command
      case 'quit':
      case 'exit':
      case 'q':
        commandQuit(stateHandlers.setRunning);
        return true;
        
      // Environment command
      case 'env':
      case 'e':
        await commandEnv(evaluator, useColors, logger);
        return true;
        
      // Macros command
      case 'macros':
      case 'm':
        commandMacros(evaluator, useColors);
        return true;
        
      // Module switching command
      case 'go':
      case 'goto':
        await commandGo(evaluator, replState, args, useColors);
        return true;
        
      // Show current module
      case 'pwd':
        console.log(`Current module: ${replState.currentModule}`);
        return true;
        
      // Module listing command
      case 'modules':
      case 'mods':
      case 'ls-m':
      case 'ls-modules':
        await commandModules(evaluator, useColors);
        return true;
        
      // Symbol listing command
      case 'list':
        await commandList(evaluator, useColors);
        return true;
        
      // Search command
      case 'find':
      case 'search':
        await commandFind(evaluator, args, useColors);
        return true;
        
      // CLI help command
      case 'cli':
        commandCli(useColors);
        return true;
        
      // Remove command (with force flag handling)
      case 'remove':
      case 'rm':
        // Special case for history removal
        if (args === '-history') {
          const { historyManager } = await import('./history-manager.ts');
          historyManager.clearAll();
          console.log("Command history has been cleared");
          return true;
        }
        
        // Process arguments with force flag
        const isForceRemove = args.startsWith('-f') || args.startsWith('-rf') || args.startsWith('-fr');
        let actualArgs = args;
        
        if (isForceRemove) {
          // Extract the actual arguments (skip the -f flag)
          const parts = args.split(/\s+/);
          if (parts.length > 1) {
            actualArgs = args.substring(parts[0].length).trim();
          } else {
            actualArgs = '';
          }
        }
        
        await commandRemove(evaluator, actualArgs, useColors, replState, isForceRemove);
        return true;
        
      // Inspect command
      case 'see':
        // Handle ":see modules" as a special case to match :modules functionality
        if (args.trim() === "modules") {
            await commandModules(evaluator, useColors);
        } else {
            await commandSee(evaluator, args, useColors, options.showJs);
        }
        return true;
        
      // Show command (alias for see)
      case 'show':
        // Handle ":show modules" as a special case to match :modules functionality
        if (args.trim() === "modules") {
            await commandModules(evaluator, useColors);
        } else {
            await commandShow(evaluator, args, useColors, options.showJs);
        }
        return true;
        
      // Documentation command
      case 'doc':
      case 'docs':
        await commandDoc(evaluator, args, useColors);
        return true;
        
      // Clear command
      case 'clear':
      case 'cls':
        console.clear();
        return true;
        
      // Verbose command
      case 'verbose':
        if (args.trim()) {
          // :verbose expression - evaluate with verbose output
          try {
            const result = await evaluator.evaluate(args, {
              verbose: true,
              baseDir: options.baseDir,
              showAst: true,
              showExpanded: true,
              showJs: true,
            });
            
            // Use result
            console.log("Verbose evaluation result:", result);
          } catch (error) {
            console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          // Toggle verbose mode
          commandVerbose(logger, stateHandlers.setVerbose);
        }
        return true;
        
      // AST display command
      case 'ast':
        if (args.trim()) {
          // :ast expression - show AST for expression
          try {
            const result = await evaluator.evaluate(args, {
              verbose: false,
              baseDir: options.baseDir,
              showAst: true, 
              showExpanded: false,
              showJs: false,
            });
            
            if (typeof result === 'object' && result !== null && 'parsedExpressions' in result) {
              // Only show the AST parts
              const { parsedExpressions } = result as any;
              console.log(JSON.stringify(parsedExpressions, null, 2));
            } else {
              console.log(result);
            }
          } catch (error) {
            console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          // Toggle AST mode
          commandAst(options.showAst, stateHandlers.setShowAst);
        }
        return true;
        
      // Expanded form display command
      case 'expanded':
        commandExpanded(options.showExpanded, stateHandlers.setShowExpanded);
        return true;
        
      // JavaScript display command
      case 'js':
        if (args.trim()) {
          // :js expression - show transpiled JavaScript for expression
          try {
            const result = await evaluator.evaluate(args, {
              verbose: false,
              baseDir: options.baseDir,
              showAst: false, 
              showExpanded: false,
              showJs: true,
            });
            
            if (typeof result === 'object' && result !== null && 'jsCode' in result) {
              console.log(`=> ${(result as any).jsCode}`);
            } else {
              console.log("No JavaScript transpilation available.");
            }
          } catch (error) {
            console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          // Toggle JS mode
          commandJs(options.showJs, stateHandlers.setShowJs);
        }
        return true;
        
      // Module creation command
      case 'mkdir':
        if (!args) {
          console.error("Module name required: mkdir <module-name>");
          return true;
        }
        
        try {
          // Check if module already exists first
          const availableModules = await evaluator.getAvailableModules();
          if (availableModules.includes(args)) {
            console.log(`Module '${args}' already exists. Use 'cd ${args}' to switch to it.`);
          } else {
            // Create a module using the evaluator's switchModule function which will create if not exists
            await evaluator.switchModule(args);
            // Return to the original module
            const currentModule = replState.currentModule;
            await evaluator.switchModule(currentModule);
            console.log(`Created module: ${args}`);
            console.log(`Use 'cd ${args}' to switch to this module.`);
          }
        } catch (error) {
          console.error(`Error creating module: ${error instanceof Error ? error.message : String(error)}`);
        }
        return true;
        
      // Unknown command
      default:
        return false;
    }
  } catch (error) {
    printError(`Command error: ${error instanceof Error ? error.message : String(error)}`, useColors);
    
    // Reset multiline state on error
    if (replState.multilineMode) {
      resetReplState(replState);
    }
    
    return true; // Still mark as handled to prevent further processing
  }
}