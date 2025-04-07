// src/repl/repl-core.ts
// Core REPL functionality and evaluation loop

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { ReplState, resetReplState, updateParenBalance } from "./repl-state.ts";
import { Environment } from "../environment.ts";
import { loadSystemMacros } from "../transpiler/hql-transpiler.ts";
import { Logger } from "../logger.ts";
import { historyManager } from "./history-manager.ts";
import { printBanner, getPrompt, prettyPrintResult, printError, colorText } from "./repl-ui.ts";
import { readLineWithArrowKeys } from "./repl-input.ts";
import { createTabCompletion } from "./repl-completion.ts";
import { 
  commandHelp, 
  commandQuit, 
  commandEnv, 
  commandMacros, 
  commandModules, 
  commandGo, 
  commandList, 
  commandRemove,
  commandSee,
  commandDoc,
  commandVerbose,
  commandAst,
  commandExpanded,
  commandJs,
  commandFind,
  commandCli
} from "./repl-commands.ts";

/**
 * Options for the REPL
 */
export interface ReplOptions {
  verbose?: boolean;
  baseDir?: string;
  historySize?: number;
  showAst?: boolean;
  showExpanded?: boolean;
  showJs?: boolean;
  initialFile?: string;
  useColors?: boolean;
  enableCompletion?: boolean;
}

/**
 * Handle CLI-style commands
 */
export async function handleCliCommands(
  input: string,
  evaluator: ModuleAwareEvaluator,
  replState: ReplState,
  useColors: boolean,
  logger: Logger,
  stateHandlers: {
    setRunning: (val: boolean) => void;
    setVerbose: (val: boolean) => void;
    setShowAst: (val: boolean) => void;
    setShowExpanded: (val: boolean) => void;
    setShowJs: (val: boolean) => void;
  },
  options: {
    baseDir: string;
    showAst: boolean;
    showExpanded: boolean;
    showJs: boolean;
  }
): Promise<boolean> {
  // CLI commands can be entered without a colon prefix
  // Examples: ls, cd utils, find map
  try {
    // Early handling for rm command to avoid JavaScript evaluation
    if (input === 'rm') {
      return executeCommand('rm', '', evaluator, replState, useColors, logger, stateHandlers, options);
    }
    
    // Extract the command and arguments
    const [cmd, ...argParts] = input.split(/\s+/);
    
    // We only handle a specific set of CLI commands
    const cliCommands = ['cd', 'ls', 'pwd', 'mkdir', 'find', 'man', 'help', 'rm', 'clear', 'cls'];
    
    if (!cliCommands.includes(cmd)) {
      return false; // Not a CLI command
    }
    
    // Handle each command specifically
    const args = argParts.join(' ');
    
    switch (cmd) {
      case 'ls':
        return executeCommand('ls', args, evaluator, replState, useColors, logger, stateHandlers, options);
        
      case 'list':
        return executeCommand('list', '', evaluator, replState, useColors, logger, stateHandlers, options);
        
      case 'pwd':
        return executeCommand('pwd', '', evaluator, replState, useColors, logger, stateHandlers, options);
        
      case 'cd':
        const moduleName = args.trim();
        if (!moduleName) {
          console.error("Missing module name. Usage: cd <module-name>");
          return true;
        }
        return executeCommand('cd', moduleName, evaluator, replState, useColors, logger, stateHandlers, options);
        
      case 'cwd':
        return executeCommand('pwd', '', evaluator, replState, useColors, logger, stateHandlers, options);
        
      case 'mkdir':
        const newModuleName = args.trim();
        if (!newModuleName) {
          console.error("Missing module name. Usage: mkdir <module-name>");
          return true;
        }
        return executeCommand('mkdir', newModuleName, evaluator, replState, useColors, logger, stateHandlers, options);
        
      case 'find':
        const pattern = args.trim();
        if (!pattern) {
          console.error("Missing search pattern. Usage: find <pattern>");
          return true;
        }
        return executeCommand('find', pattern, evaluator, replState, useColors, logger, stateHandlers, options);
        
      case 'man':
        const commandName = args.trim();
        return executeCommand('help', commandName, evaluator, replState, useColors, logger, stateHandlers, options);
        
      case 'help':
        return executeCommand('help', '', evaluator, replState, useColors, logger, stateHandlers, options);
        
      case 'cli':
        return executeCommand('cli', '', evaluator, replState, useColors, logger, stateHandlers, options);
        
      case 'rm':
        const target = args.trim();
        return executeCommand('rm', target, evaluator, replState, useColors, logger, stateHandlers, options);
        
      case 'clear':
      case 'cls':
        return executeCommand('clear', '', evaluator, replState, useColors, logger, stateHandlers, options);
        
      default:
        return executeCommand('help', '', evaluator, replState, useColors, logger, stateHandlers, options);
    }
  } catch (error) {
    console.error(`CLI command error: ${error instanceof Error ? error.message : String(error)}`);
    return true;
  }
  
  return false;
}

// Create a central command execution function to unify CLI and REPL commands
async function executeCommand(
  command: string,
  args: string,
  evaluator: ModuleAwareEvaluator,
  replState: ReplState,
  useColors: boolean,
  logger: Logger,
  stateHandlers: {
    setRunning: (val: boolean) => void;
    setVerbose: (val: boolean) => void;
    setShowAst: (val: boolean) => void;
    setShowExpanded: (val: boolean) => void;
    setShowJs: (val: boolean) => void;
  },
  options: {
    baseDir: string;
    showAst: boolean;
    showExpanded: boolean;
    showJs: boolean;
  }
): Promise<boolean> {
  try {
    // Special case for ls -m or ls -modules
    if (command === 'ls' && (args === '-m' || args === '-modules')) {
      await commandModules(evaluator, useColors);
      return true;
    }
    
    // Handle rm with no arguments - provide helpful message
    if ((command === 'rm' || command === 'remove') && !args.trim()) {
      console.log(colorText("Usage:", useColors ? "\x1b[1m" : "", useColors));
      console.log(`  rm <symbol>        - Remove a symbol from current module`);
      console.log(`  rm <module>        - Remove an entire module`);
      console.log(`  rm <module>:<symbol> - Remove a symbol from a specific module`);
      console.log(`  rm -f ...          - Force remove without confirmation`);
      console.log(`  rm -rf ...         - Force remove recursively without confirmation`);
      console.log(`  rm *               - Remove all symbols in current module`);
      console.log(`  rm /               - Remove everything (all modules and symbols)`);
      
      // Show available modules and symbols to help the user
      console.log("");
      console.log(colorText("Available modules:", useColors ? "\x1b[36m" : "", useColors));
      evaluator.getAvailableModules().then(modules => {
        if (modules.length > 0) {
          modules.forEach(module => {
            console.log(`  ${module}${module === replState.currentModule ? ' (current)' : ''}`);
          });
        } else {
          console.log("  No modules available");
        }
        
        console.log("");
        console.log(colorText("Symbols in current module:", useColors ? "\x1b[36m" : "", useColors));
        evaluator.listModuleSymbols().then(symbols => {
          if (symbols.length > 0) {
            symbols.forEach(symbol => {
              console.log(`  ${symbol}`);
            });
          } else {
            console.log("  No symbols defined in current module");
          }
          
          // Examples
          console.log("");
          console.log(colorText("Examples:", useColors ? "\x1b[33m" : "", useColors));
          console.log(`  rm factorial     - Remove 'factorial' symbol from current module`);
          console.log(`  rm math          - Remove 'math' module (with confirmation)`);
          console.log(`  rm math:sqrt     - Remove 'sqrt' symbol from 'math' module`);
          console.log(`  rm -f math       - Force remove 'math' module without confirmation`);
          console.log(`  rm *             - Remove all symbols in current module`);
        });
      });
      
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
      case 'cd':
        await commandGo(evaluator, replState, args, useColors);
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
      case 'ls':
        await commandList(evaluator, useColors);
        return true;
        
      // Show current module
      case 'pwd':
        console.log(`Current module: ${replState.currentModule}`);
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
        
        try {
          // Special case for rm / and rm *
          if (actualArgs === '/' || actualArgs === '*' || actualArgs === './*') {
            await commandRemove(evaluator, actualArgs, useColors, replState, isForceRemove);
            return true;
          }
          
          // Get available modules for validation
          const availableModules = await evaluator.getAvailableModules();
          
          // Format can be: rm <symbol>, rm <module>, or rm <module>:<symbol>
          if (actualArgs.includes(':')) {
            // Format: rm module:symbol
            const [moduleName, symbolName] = actualArgs.split(':');
            
            // Validate module exists
            if (symbolName && !availableModules.includes(moduleName)) {
              console.error(`Module '${moduleName}' does not exist.`);
              console.log("Use :modules or ls -m to see available modules.");
              return true;
            }
            
            await commandRemove(evaluator, actualArgs, useColors, replState, isForceRemove);
          } else {
            // Check if this could be a module name
            if (availableModules.includes(actualArgs)) {
              // Format: rm module
              await commandRemove(evaluator, actualArgs, useColors, replState, isForceRemove);
            } else {
              // Check if user is trying to remove non-existent module
              const currentModule = evaluator.getCurrentModuleSync();
              const symbols = await evaluator.listModuleSymbols(currentModule);
              
              if (!symbols.includes(actualArgs) && !actualArgs.startsWith("all:") && actualArgs !== "all") {
                // Check if it might be a module name typo
                const moduleGuesses = availableModules.filter(m => 
                  m.toLowerCase().includes(actualArgs.toLowerCase()));
                
                if (moduleGuesses.length > 0) {
                  console.error(`Symbol '${actualArgs}' not found in current module and no module with that name exists.`);
                  console.log("Did you mean one of these modules?");
                  moduleGuesses.forEach(m => console.log(`- ${m}`));
                  return true;
                }
                
                console.error(`Target '${actualArgs}' not found in current module or as a module.`);
                console.log('Use :modules or ls -m to see available modules.');
                console.log('Use :list or ls to see available symbols in current module.');
                return true;
              }
              
              // Format: rm symbol
              await commandRemove(evaluator, actualArgs, useColors, replState, isForceRemove);
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          
          // Check for common command errors
          if (errorMsg.includes("rm is not defined")) {
            printError("'rm' is not a valid expression. Did you mean to use it as a command?", useColors);
            console.log("");
            console.log(colorText("Usage:", useColors ? "\x1b[1m" : "", useColors));
            console.log("  rm <symbol>        - Remove a symbol from current module");
            console.log("  rm <module>        - Remove an entire module");
            console.log("  rm <module>:<symbol> - Remove a symbol from a specific module");
            console.log("  rm -f ...          - Force remove without confirmation");
            console.log("  rm -rf ...         - Force remove recursively without confirmation");
            console.log("  rm *               - Remove all symbols in current module");
            console.log("  rm /               - Remove everything (all modules and symbols)");
            
            // Show available modules and symbols
            console.log("");
            console.log(colorText("Available modules:", useColors ? "\x1b[36m" : "", useColors));
            evaluator.getAvailableModules().then(modules => {
              if (modules.length > 0) {
                modules.forEach(module => {
                  console.log(`  ${module}${module === replState.currentModule ? ' (current)' : ''}`);
                });
              } else {
                console.log("  No modules available");
              }
              
              console.log("");
              console.log(colorText("Symbols in current module:", useColors ? "\x1b[36m" : "", useColors));
              evaluator.listModuleSymbols().then(symbols => {
                if (symbols.length > 0) {
                  symbols.forEach(symbol => {
                    console.log(`  ${symbol}`);
                  });
                } else {
                  console.log("  No symbols defined in current module");
                }
                
                // Show examples
                console.log("");
                console.log(colorText("Examples:", useColors ? "\x1b[33m" : "", useColors));
                console.log(`  rm factorial     - Remove 'factorial' symbol from current module`);
                console.log(`  rm math          - Remove 'math' module (with confirmation)`);
                console.log(`  rm math:sqrt     - Remove 'sqrt' symbol from 'math' module`);
                console.log(`  rm -f math       - Force remove 'math' module without confirmation`);
              });
            });
          } else {
            // Regular error handling
            printError(errorMsg, useColors);
          }
          
          // Reset multiline state on error
          if (replState.multilineMode) {
            resetReplState(replState);
          }
        }
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
        
      // Documentation command
      case 'doc':
      case 'docs':
        await commandDoc(evaluator, args, useColors);
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
            
            // Display detailed result
            if (result !== undefined) {
              prettyPrintResult(result, useColors, true);
            }
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
        
      // Clear screen command
      case 'clear':
      case 'cls':
        console.clear();
        return true;
        
      // Unknown command
      default:
        return false;
    }
  } catch (error) {
    console.error(`Command error: ${error instanceof Error ? error.message : String(error)}`);
    return true;
  }
}

/**
 * Handle JavaScript evaluation errors
 */
function handleJsEvaluationError(error: Error, input: string, evaluator: ModuleAwareEvaluator, useColors: boolean, replState: ReplState, logger: { isVerbose: boolean }): void {
  // Handle specific error cases with better messages
  const errorMessage = error.message || "Unknown error";
  const userInput = input.trim().toLowerCase();
  
  // Special handling for common CLI commands when used incorrectly
  if (errorMessage.includes("is not defined") || errorMessage.includes("not a function")) {
    const commandMatch = /(?:return\s+)?([\w-]+)(?:\(.*\))?;?/.exec(input);
    if (commandMatch) {
      const possibleCommand = commandMatch[1].toLowerCase();
      
      // Handle rm not defined - likely tried to use it without a colon
      if (possibleCommand === "rm") {
        printError(`rm is not a valid expression in the REPL. Did you mean to use it as a command?`, useColors);
        console.log(`Use rm as a command: rm <symbol> or rm <module> or rm <module>:<symbol>`);
        console.log(`For more help, try: :help rm`);
        
        // Show available modules and symbols to help the user decide what to remove
        console.log("");
        console.log(colorText("Available modules:", useColors ? "\x1b[36m" : "", useColors));
        evaluator.getAvailableModules().then(modules => {
          if (modules.length > 0) {
            modules.forEach(module => {
              console.log(`  ${module}${module === replState.currentModule ? ' (current)' : ''}`);
            });
          } else {
            console.log("  No modules available");
          }
          
          console.log("");
          console.log(colorText("Symbols in current module:", useColors ? "\x1b[36m" : "", useColors));
          evaluator.listModuleSymbols().then(symbols => {
            if (symbols.length > 0) {
              symbols.forEach(symbol => {
                console.log(`  ${symbol}`);
              });
            } else {
              console.log("  No symbols defined in current module");
            }
            
            // Examples
            console.log("");
            console.log(colorText("Examples:", useColors ? "\x1b[33m" : "", useColors));
            console.log(`  rm factorial     - Remove 'factorial' symbol from current module`);
            console.log(`  rm math          - Remove 'math' module (with confirmation)`);
            console.log(`  rm math:sqrt     - Remove 'sqrt' symbol from 'math' module`);
            console.log(`  rm -f math       - Force remove 'math' module without confirmation`);
            console.log(`  rm *             - Remove all symbols in current module`);
          });
        });
        
        return;
      }
      
      // Handle cd not defined - likely tried to use it without a colon
      if (possibleCommand === "cd") {
        printError(`cd is not a valid expression in the REPL. Did you mean to use it as a command?`, useColors);
        console.log(`Use cd as a command: cd <module-name>`);
        console.log(`For more help, try: :help cd`);
        
        // Show available modules to help the user decide what to switch to
        console.log("");
        console.log(colorText("Available modules:", useColors ? "\x1b[36m" : "", useColors));
        evaluator.getAvailableModules().then(modules => {
          if (modules.length > 0) {
            modules.forEach(module => {
              console.log(`  ${module}${module === replState.currentModule ? ' (current)' : ''}`);
            });
          } else {
            console.log("  No modules available");
          }
          
          console.log("");
          console.log(colorText("Symbols in current module:", useColors ? "\x1b[36m" : "", useColors));
          evaluator.listModuleSymbols().then(symbols => {
            if (symbols.length > 0) {
              symbols.forEach(symbol => {
                console.log(`  ${symbol}`);
              });
            } else {
              console.log("  No symbols defined in current module");
            }
            
            // Examples
            console.log("");
            console.log(colorText("Examples:", useColors ? "\x1b[33m" : "", useColors));
            console.log(`  cd math          - Switch to 'math' module`);
            console.log(`  cd utils         - Switch to 'utils' module`);
          });
        });
        
        return;
      }
      
      // Handle other common CLI commands and suggest proper usage
      const cliCommands = {
        "ls": "List symbols in current module",
        "pwd": "Show current module",
        "find": "Search for symbols and modules",
        "mkdir": "Create a new module",
        "man": "Show help for a command",
        "clear": "Clear the terminal screen",
        "cls": "Clear the terminal screen"
      };
      
      if (possibleCommand in cliCommands) {
        printError(`${possibleCommand} is not a valid expression in the REPL. Did you mean to use it as a command?`, useColors);
        console.log(`Use ${possibleCommand} as a command directly (no need for a colon). For example:`);
        console.log(`  ${possibleCommand} <args>  - ${cliCommands[possibleCommand as keyof typeof cliCommands]}`);
        console.log(`For more help, try: :help ${possibleCommand}`);
        return;
      }
    }
  }
  
  // Default error handling
  printError(`JavaScript evaluation error: ${errorMessage}`, useColors);
  logger.isVerbose && console.log("[Debug] Processing error first time:", errorMessage, "in REPL JS evaluation");
  
  let errorType = "JavaScript";
  let errorLocation = "REPL JS";
  
  printError(`${errorMessage}`, useColors);
  console.log(`Location: ${errorLocation}`);
  
  // Show the code snippet where the error occurred
  console.log();
  const codeLines = input.split("\n");
  const numLines = codeLines.length;
  
  // Show at most 5 lines of code
  const startLine = Math.max(0, numLines > 5 ? numLines - 5 : 0);
  for (let i = startLine; i < numLines; i++) {
    console.log(`${i + 1} │ ${codeLines[i]}`);
  }
  
  console.log();
  console.log(errorMessage);
}

/**
 * Main entry point for the REPL
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
  
  // Handler functions to set global state
  const setRunning = (val: boolean) => { running = val; };
  const setVerbose = (val: boolean) => {
    showVerbose = val;
    logger.setEnabled(val);
  };
  const setShowAst = (val: boolean) => { showAst = val; };
  const setShowExpanded = (val: boolean) => { showExpanded = val; };
  const setShowJs = (val: boolean) => { showJs = val; };
  
  // Pack the state together for easier parameter passing
  const replStateHandlers = {
    setRunning,
    setVerbose,
    setShowAst,
    setShowExpanded,
    setShowJs
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
    const tabCompletion = enableCompletion 
      ? createTabCompletion(evaluator, () => replState.currentModule) 
      : undefined;

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
        
        // Handle CLI command shortcuts first
        const isCliCommand = await handleCliCommands(input, evaluator, replState, useColors, logger, replStateHandlers, {
          baseDir,
          showAst,
          showExpanded,
          showJs
        });
        if (isCliCommand) {
          continue; // Skip to next iteration if we handled a CLI command
        }

        if (input.startsWith(':')) {
            // Split command from arguments
            const [command, ...args] = input.substring(1).split(/\s+/);
            const argsText = args.join(' ');
            
            try {
              const isCommandHandled = await executeCommand(command, argsText, evaluator, replState, useColors, logger, replStateHandlers, {
                baseDir,
                showAst,
                showExpanded,
                showJs
              });
              if (isCommandHandled) {
                continue; // Skip to next iteration if we handled a command
              } else {
                // If command was not recognized, provide helpful message
                console.log(`Unknown command: :${command}`);
                console.log(`Type :help for available commands`);
                continue;
              }
            } catch (error) {
              console.error(`Error executing command: ${error instanceof Error ? error.message : String(error)}`);
              continue;
            }
        }
        
        // If we get here, it's not a command, so evaluate as HQL code
        try {
          // Check for parenthesis balance and trigger multiline mode if needed
          const newBalance = updateParenBalance(input, replState.parenBalance, replState.bracketStack);
          
          if (newBalance > 0 || replState.bracketStack.length > 0) {
            // Start or continue multiline mode
            if (!replState.multilineMode) {
              replState.multilineMode = true;
              replState.multilineInput = input;
            } else {
              replState.multilineInput += '\n' + input;
            }
            
            replState.parenBalance = newBalance;
            // Skip evaluation, wait for more input
            continue;
          } else if (replState.multilineMode) {
            // Complete multiline input
            input = replState.multilineInput + '\n' + input;
            resetReplState(replState);
          }
          
          // Evaluate the HQL expression
          const result = await evaluator.evaluate(input, {
            verbose: showVerbose,
            baseDir,
            showAst,
            showExpanded,
            showJs,
          });
          
          // Print result
          if (result !== undefined) {
            prettyPrintResult(result, useColors, showVerbose);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          
          // Check if it might be a command being used as an expression
          if (errorMsg.includes("rm is not defined") || input.trim() === "rm") {
            printError("'rm' is not a valid expression. Did you mean to use it as a command?", useColors);
            console.log("");
            console.log(colorText("Usage:", useColors ? "\x1b[1m" : "", useColors));
            console.log("  rm <symbol>        - Remove a symbol from current module");
            console.log("  rm <module>        - Remove an entire module");
            console.log("  rm <module>:<symbol> - Remove a symbol from a specific module");
            console.log("  rm -f ...          - Force remove without confirmation");
            console.log("  rm -rf ...         - Force remove recursively without confirmation");
            console.log("  rm *               - Remove all symbols in current module");
            console.log("  rm /               - Remove everything (all modules and symbols)");
            
            // Show available modules and symbols
            console.log("");
            console.log(colorText("Available modules:", useColors ? "\x1b[36m" : "", useColors));
            evaluator.getAvailableModules().then(modules => {
              if (modules.length > 0) {
                modules.forEach(module => {
                  console.log(`  ${module}${module === replState.currentModule ? ' (current)' : ''}`);
                });
              } else {
                console.log("  No modules available");
              }
              
              console.log("");
              console.log(colorText("Symbols in current module:", useColors ? "\x1b[36m" : "", useColors));
              evaluator.listModuleSymbols().then(symbols => {
                if (symbols.length > 0) {
                  symbols.forEach(symbol => {
                    console.log(`  ${symbol}`);
                  });
                } else {
                  console.log("  No symbols defined in current module");
                }
                
                // Show examples
                console.log("");
                console.log(colorText("Examples:", useColors ? "\x1b[33m" : "", useColors));
                console.log(`  rm factorial     - Remove 'factorial' symbol from current module`);
                console.log(`  rm math          - Remove 'math' module (with confirmation)`);
                console.log(`  rm math:sqrt     - Remove 'sqrt' symbol from 'math' module`);
                console.log(`  rm -f math       - Force remove 'math' module without confirmation`);
                console.log(`  rm *             - Remove all symbols in current module`);
              });
            });
          } else {
            // Regular error handling
            printError(errorMsg, useColors);
          }
          
          // Reset multiline state on error
          if (replState.multilineMode) {
            resetReplState(replState);
          }
        }
      } catch (error) {
        console.error(`Error in REPL loop: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    console.error(`Error starting REPL: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    // Reset terminal state
    try {
      if (Deno.build.os !== "windows") {
        Deno.stdin.setRaw(false);
      }
    } catch (e) {
      // Ignore errors when resetting terminal
    }
  }
}