// src/repl/repl-core.ts
// Core REPL functionality and evaluation loop

import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { ReplState, resetReplState, updateParenBalance } from "./repl-state.ts";
import { Environment } from "@core/environment.ts";
import { loadSystemMacros } from "@transpiler/hql-transpiler.ts";
import { globalLogger as logger } from "@core/logger.ts";
import { historyManager } from "./history-manager.ts";
import { printBanner, getPrompt, prettyPrintResult } from "./repl-commands.ts";
import { printError, handleJsEvaluationError, ReplStateHandlers, CommonReplOptions, commandUtils } from "./repl-common.ts";
import { formatErrorMessage } from "@core/common/error-pipeline.ts"
import { executeCommand } from "./command-executor.ts";

/**
 * Main entry point for the REPL
 */
export async function startRepl(): Promise<void> {
  console.log("Starting HQL REPL...");
  
  // Always resolve baseDir relative to the REPL core file if not provided
  const baseDir = path.resolve(path.dirname(path.fromFileUrl(import.meta.url)), '../../');
  const useColors = true;
  const historySize = 100;
  const enableCompletion = true;
  
  let running = true;
  const history: string[] = historyManager.load(historySize);
  let historyIndex = -1;
  
  // REPL display options
  let showVerbose = false;
  let showAst = false;
  let showExpanded = false;
  let showJs = false;
  
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
  const replStateHandlers: ReplStateHandlers = {
    setRunning,
    setVerbose,
    setShowAst,
    setShowExpanded,
    setShowJs
  };
  
  // Common options for commands
  const commonOptions: CommonReplOptions = {
    baseDir,
    showAst,
    showExpanded,
    showJs,
    useColors
  };
  
  printBanner(useColors);
  
  try {
    // Initialize environment
    const env = await Environment.initializeGlobalEnv({ verbose: showVerbose });
    await loadSystemMacros(env, { verbose: showVerbose, baseDir: Deno.cwd() });
    
    // Create evaluator
    const evaluator = new ModuleAwareEvaluator(env, {
      verbose: showVerbose,
      baseDir,
      showAst,
      showExpanded,
      showJs,
    });
    
    // Initialize evaluator
    await evaluator.initialize();
    await evaluator.switchModule("global");
    replState.currentModule = evaluator.getCurrentModuleSync();

    while (running) {
      try {
        const prompt = getPrompt(replState, useColors);
        
        // Handle input differently based on whether raw mode is available
        let input = "";
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
        
        // Check if input is a REPL command
        if (commandUtils.isReplCommand(input)) {
          const { command, args } = commandUtils.parseReplCommand(input);
          const isHandled = await executeCommand(command, args, evaluator, replState, useColors, logger, replStateHandlers, commonOptions);
          
          // Clear history array if the command was :remove -history
          if (isHandled && command === 'remove' && args === '-history') {
            history.length = 0;
          }
          
          if (isHandled) continue;
          
          // If command was not recognized, provide helpful message
          console.log(`Unknown command: :${command}`);
          console.log(`Type :help for available commands`);
          continue;
        }
        
        // Check if input is a CLI command
        if (commandUtils.isCliCommand(input)) {
          const { command, args } = commandUtils.parseCliCommand(input);
          const isHandled = await executeCommand(command, args, evaluator, replState, useColors, logger, replStateHandlers, commonOptions);
          
          // Clear history array if the command was rm -history
          if (isHandled && command === 'rm' && args === '-history') {
            history.length = 0;
          }
          
          if (isHandled) continue;
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
          
          // Handle standard evaluation or other commands
          const result = await evaluator.evaluate(input, { verbose: showVerbose });

          // Display the result
          if (result.value !== undefined) {
            prettyPrintResult(result, useColors, showVerbose);
          }
        } catch (error) {
          const errorMsg = formatErrorMessage(error);
          
          // Handle JavaScript evaluation errors in a consistent way
          if (error instanceof Error && error.stack?.includes("JavaScript evaluation")) {
            handleJsEvaluationError(error, input, evaluator, useColors, replState, logger);
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
        console.error(`Error in REPL loop: ${formatErrorMessage(error)}`);
      }
    }
  } catch (error) {
    console.error(`Error starting REPL: ${formatErrorMessage(error)}`);
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