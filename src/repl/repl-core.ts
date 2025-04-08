// src/repl/repl-core.ts
// Core REPL functionality and evaluation loop

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";
import { ReplState, resetReplState, updateParenBalance } from "./repl-state.ts";
import { Environment } from "../environment.ts";
import { loadSystemMacros } from "../transpiler/hql-transpiler.ts";
import { Logger } from "../logger.ts";
import { historyManager } from "./history-manager.ts";
import { printBanner, getPrompt, prettyPrintResult } from "./repl-commands.ts";
import { readLineWithArrowKeys } from "./repl-input.ts";
import { createTabCompletion } from "./repl-completion.ts";
import { colorText, printError, handleJsEvaluationError, ReplStateHandlers, CommonReplOptions, commandUtils } from "./repl-common.ts";
import { executeCommand } from "./command-executor.ts";

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
        
        // Check if input is a CLI command
        if (commandUtils.isCliCommand(input)) {
          const { command, args } = commandUtils.parseCliCommand(input);
          const isHandled = await executeCommand(command, args, evaluator, replState, useColors, logger, replStateHandlers, commonOptions);
          if (isHandled) continue;
        }
        
        // Check if input is a REPL command
        if (commandUtils.isReplCommand(input)) {
          const { command, args } = commandUtils.parseReplCommand(input);
          const isHandled = await executeCommand(command, args, evaluator, replState, useColors, logger, replStateHandlers, commonOptions);
          if (isHandled) continue;
          
          // If command was not recognized, provide helpful message
          console.log(`Unknown command: :${command}`);
          console.log(`Type :help for available commands`);
          continue;
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
          const errorMsg = error instanceof Error ? error.message : String(error);
          
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