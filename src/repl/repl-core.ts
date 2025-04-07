// src/repl/repl-core.ts
// Core REPL functionality and evaluation loop

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { ReplState, resetReplState, updateParenBalance } from "./repl-state.ts";
import { Environment } from "../environment.ts";
import { loadSystemMacros } from "../transpiler/hql-transpiler.ts";
import { Logger } from "../logger.ts";
import { historyManager } from "./history-manager.ts";
import { printBanner, getPrompt, prettyPrintResult, printError } from "./repl-ui.ts";
import { readLineWithArrowKeys } from "./repl-input.ts";
import { createTabCompletion } from "./repl-completion.ts";
import { 
  commandHelp, 
  commandQuit, 
  commandEnv, 
  commandMacros, 
  commandModules, 
  commandModule, 
  commandList, 
  commandRemove,
  commandSee,
  commandDoc,
  commandVerbose,
  commandAst,
  commandExpanded,
  commandJs
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
    logger.setVerbose(val);
  };
  const setShowAst = (val: boolean) => { showAst = val; };
  const setShowExpanded = (val: boolean) => { showExpanded = val; };
  const setShowJs = (val: boolean) => { showJs = val; };
  
  // Pack the state together for easier parameter passing
  const replStateHandlers = {
    setRunning,
    setVerbose
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
        
        // Handle CLI command shortcuts - before any other processing
        if (input.trim() === 'ls') {
          try {
            await commandModules(evaluator, useColors);
          } catch (error) {
            console.error(`Error listing modules: ${error instanceof Error ? error.message : String(error)}`);
          }
          continue;
        }
        else if (input.trim() === 'pwd') {
          console.log(`Current module: ${replState.currentModule}`);
          continue;
        }
        else if (input.trim().startsWith('cd ')) {
          const moduleName = input.trim().substring(3).trim();
          if (moduleName) {
            try {
              await commandModule(evaluator, replState, moduleName);
            } catch (error) {
              console.error(`Error switching modules: ${error instanceof Error ? error.message : String(error)}`);
            }
          } else {
            console.log(`Current module: ${replState.currentModule}`);
          }
          continue;
        }
        else if (input.trim().startsWith('mkdir ')) {
          const moduleName = input.trim().substring(6).trim();
          if (moduleName) {
            try {
              // Create a module using the evaluator's switchModule function which will create if not exists
              await evaluator.switchModule(moduleName);
              // Return to the original module
              const currentModule = replState.currentModule;
              await evaluator.switchModule(currentModule);
              console.log(`Created module: ${moduleName}`);
            } catch (error) {
              console.error(`Error creating module: ${error instanceof Error ? error.message : String(error)}`);
            }
          } else {
            console.error("Module name required: mkdir <module-name>");
          }
          continue;
        }

        // Handle commands (starting with :)
        if (input.startsWith(':')) {
          // Split command from arguments
          const [command, ...args] = input.substring(1).split(/\s+/);
          const argsText = args.join(' ');
          
          try {
            switch (command.toLowerCase()) {
              case 'help':
              case 'h':
                commandHelp(argsText, useColors);
                break;
                
              case 'quit':
              case 'exit':
              case 'q':
                commandQuit(setRunning);
                break;
                
              case 'env':
              case 'e':
                await commandEnv(evaluator, useColors, logger);
                break;
                
              case 'macros':
              case 'm':
                commandMacros(evaluator, useColors);
                break;
                
              case 'module':
              case 'mod':
                await commandModule(evaluator, replState, argsText);
                break;
                
              case 'modules':
              case 'mods':
                await commandModules(evaluator, useColors);
                break;
                
              case 'list':
              case 'ls':
                await commandList(evaluator, useColors);
                break;
                
              case 'remove':
              case 'rm':
                await commandRemove(evaluator, argsText, useColors, replState);
                break;
                
              case 'see':
                await commandSee(evaluator, argsText, useColors, showJs);
                break;
                
              case 'doc':
              case 'docs':
                await commandDoc(evaluator, argsText, useColors);
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
                  commandVerbose(logger, setVerbose);
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
                  commandAst(showAst, setShowAst);
                }
                break;
                
              case 'expanded':
                commandExpanded(showExpanded, setShowExpanded);
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
                  commandJs(showJs, setShowJs);
                }
                break;
                
              default:
                console.log(`Unknown command: ${command}`);
                console.log("Use :help to see available commands");
            }
          } catch (error) {
            console.error(`Command error: ${error instanceof Error ? error.message : String(error)}`);
          }
          
          continue; // Skip to next iteration after handling command
        }
        
        // Handle HQL expressions - these might be multiline
        try {
          // Update paren balance
          replState.parenBalance = updateParenBalance(input, replState.parenBalance);
          
          if (replState.multilineMode) {
            // Continue multiline input
            replState.multilineInput += "\n" + input;
            
            // If balance is restored, evaluate the complete input
            if (replState.parenBalance <= 0) {
              const fullInput = replState.multilineInput.trim();
              
              try {
                const result = await evaluator.evaluate(fullInput, {
                  verbose: showVerbose,
                  baseDir,
                  showAst,
                  showExpanded,
                  showJs,
                });
                
                if (result !== undefined) {
                  // Only show simple result by default
                  if (showVerbose) {
                    console.log(result);
                  } else {
                    // Check if result has a value property
                    if (result && typeof result === 'object' && 'value' in result) {
                      prettyPrintResult((result as any).value, useColors);
                    } else {
                      prettyPrintResult(result, useColors);
                    }
                  }
                }
              } catch (error) {
                printError(`Error: ${error instanceof Error ? error.message : String(error)}`, useColors);
              }
              
              // Reset multiline state
              resetReplState(replState);
            }
          } else if (replState.parenBalance > 0) {
            // Start multiline input mode
            replState.multilineMode = true;
            replState.multilineInput = input;
          } else {
            // Single line evaluation
            try {
              // Check for module switch directive first
              const isModuleSwitch = await evaluator.detectModuleSwitch(input);
              if (isModuleSwitch) {
                // Update the current module in replState
                replState.currentModule = evaluator.getCurrentModuleSync();
                continue;
              }
              
              // Check for special HQL expressions before normal evaluation
              const isSpecialExpr = await evaluator.detectSpecialHqlExpressions(input);
              if (isSpecialExpr) {
                continue;
              }
              
              // Regular evaluation
              const result = await evaluator.evaluate(input, {
                verbose: showVerbose,
                baseDir,
                showAst,
                showExpanded, 
                showJs,
              });
              
              if (result !== undefined) {
                // Only show simple result by default
                if (showVerbose) {
                  console.log(result);
                } else {
                  // Check if result has a value property
                  if (result && typeof result === 'object' && 'value' in result) {
                    prettyPrintResult((result as any).value, useColors);
                  } else {
                    prettyPrintResult(result, useColors);
                  }
                }
              }
            } catch (error) {
              printError(`Error: ${error instanceof Error ? error.message : String(error)}`, useColors);
            }
          }
        } catch (error) {
          printError(`Error: ${error instanceof Error ? error.message : String(error)}`, useColors);
          
          // Reset multiline state on error
          resetReplState(replState);
        }
      } catch (error) {
        printError(`REPL error: ${error instanceof Error ? error.message : String(error)}`, useColors);
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
    
    // Save any pending state
    try {
      const { persistentStateManager } = await import("./persistent-state-manager.ts");
      persistentStateManager.forceSync();
    } catch (e) {
      // Ignore errors if persistent state manager is not available
    }
  } catch (error) {
    printError(`REPL initialization error: ${error instanceof Error ? error.message : String(error)}`, useColors);
    Deno.exit(1);
  }
}