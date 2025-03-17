// src/s-exp/repl.ts - Interactive REPL for the S-expression frontend

import { parse } from "./parser.ts";
import { SEnv, initializeGlobalEnv } from "./environment.ts";
import { initializeCoreMacros } from "./core-macros.ts";
import { expandMacros, evaluateForMacro } from "./macro.ts";
import { sexpToString } from "./types.ts";
import { Logger } from "../logger.ts";
import { convertToHqlAst } from "./connector.ts";
import { transformAST } from "../transformer.ts";

/**
 * Configuration for the REPL
 */
interface ReplOptions {
  verbose?: boolean;
  baseDir?: string;
  historySize?: number;
  showAst?: boolean;
  showExpanded?: boolean;
  showJs?: boolean;
}

/**
 * Interactive REPL for testing the S-expression frontend
 */
export async function startRepl(options: ReplOptions = {}): Promise<void> {
  const logger = new Logger(options.verbose || false);
  const baseDir = options.baseDir || Deno.cwd();
  const historySize = options.historySize || 50;
  const showAst = options.showAst !== undefined ? options.showAst : false;
  const showExpanded = options.showExpanded !== undefined ? options.showExpanded : true;
  const showJs = options.showJs !== undefined ? options.showJs : true;
  
  // Banner
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                HQL S-Expression REPL                        ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log("║  Type HQL expressions to evaluate them                      ║");
  console.log("║  Special commands:                                          ║");
  console.log("║    :help - Display this help                                ║");
  console.log("║    :quit, :exit - Exit the REPL                             ║");
  console.log("║    :env - Show environment bindings                         ║");
  console.log("║    :macros - Show defined macros                            ║");
  console.log("║    :verbose - Toggle verbose mode                           ║");
  console.log("║    :ast - Toggle AST display                                ║");
  console.log("║    :expanded - Toggle expanded form display                 ║");
  console.log("║    :js - Toggle JavaScript output display                   ║");
  console.log("║    :load <filename> - Load and evaluate a file              ║");
  console.log("║    :save <filename> - Save history to a file                ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  
  // Initialize environment
  logger.log("Initializing environment...");
  const env = initializeGlobalEnv({ verbose: options.verbose });
  initializeCoreMacros(env, logger);
  
  // Keep history
  const history: string[] = [];
  
  // Set up stdin reader
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  // Main REPL loop
  let running = true;
  let multilineInput = "";
  let multilineMode = false;
  let parenBalance = 0;
  
  while (running) {
    try {
      // Display prompt
      const prompt = multilineMode ? "... " : "hql> ";
      await Deno.stdout.write(encoder.encode(prompt));
      
      // Read line
      const buf = new Uint8Array(1024);
      const n = await Deno.stdin.read(buf);
      if (n === null) break;
      
      const line = decoder.decode(buf.subarray(0, n)).trim();
      
      // Handle multiline input
      if (multilineMode) {
        multilineInput += line + "\n";
        
        // Count parentheses to determine when input is complete
        for (const char of line) {
          if (char === '(') parenBalance++;
          else if (char === ')') parenBalance--;
        }
        
        if (parenBalance <= 0) {
          multilineMode = false;
          await processInput(multilineInput, env, history, {
            logger,
            baseDir,
            historySize,
            showAst,
            showExpanded,
            showJs,
          });
          multilineInput = "";
          parenBalance = 0;
        }
        
        continue;
      }
      
      // Handle special commands
      if (line.startsWith(":")) {
        await handleCommand(line, env, history, {
          logger,
          baseDir,
          showAst,
          showExpanded,
          showJs,
          running: () => running,
          setRunning: (value) => { running = value; },
          setVerbose: (value) => { logger.setEnabled(value); },
          setShowAst: (value) => { showAst = value; },
          setShowExpanded: (value) => { showExpanded = value; },
          setShowJs: (value) => { showJs = value; },
        });
        continue;
      }
      
      // Start multiline mode if input is not complete
      for (const char of line) {
        if (char === '(') parenBalance++;
        else if (char === ')') parenBalance--;
      }
      
      if (parenBalance > 0) {
        multilineMode = true;
        multilineInput = line + "\n";
        continue;
      }
      
      // Process single-line input
      await processInput(line, env, history, {
        logger,
        baseDir,
        historySize,
        showAst,
        showExpanded,
        showJs,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
      
      // Reset multiline mode on error
      multilineMode = false;
      multilineInput = "";
      parenBalance = 0;
    }
  }
  
  console.log("\nGoodbye!");
}

/**
 * Process a single input line in the REPL
 */
async function processInput(
  input: string,
  env: SEnv,
  history: string[],
  options: {
    logger: Logger;
    baseDir: string;
    historySize: number;
    showAst: boolean;
    showExpanded: boolean;
    showJs: boolean;
  }
): Promise<void> {
  const { logger, baseDir, historySize, showAst, showExpanded, showJs } = options;
  
  // Skip empty input
  if (!input.trim()) return;
  
  // Add to history
  if (history.length >= historySize) {
    history.shift();
  }
  history.push(input);
  
  try {
    // Parse input
    logger.debug("Parsing input...");
    const sexps = parse(input);
    
    if (sexps.length === 0) {
      console.log("No expressions to evaluate");
      return;
    }
    
    // Show the parsed S-expressions if requested
    if (showAst) {
      console.log("Parsed S-expressions:");
      for (const sexp of sexps) {
        console.log(`  ${sexpToString(sexp)}`);
      }
      console.log();
    }
    
    // Expand macros
    logger.debug("Expanding macros...");
    const expanded = expandMacros(sexps, env, { verbose: logger.enabled });
    
    // Show expanded forms if requested
    if (showExpanded) {
      console.log("Expanded forms:");
      for (const sexp of expanded) {
        console.log(`  ${sexpToString(sexp)}`);
      }
      console.log();
    }
    
    // Evaluate
    logger.debug("Evaluating...");
    for (const sexp of expanded) {
      const result = evaluateForMacro(sexp, env, logger);
      console.log("=> ", sexpToString(result));
    }
    
    // Generate JavaScript if requested
    if (showJs) {
      logger.debug("Generating JavaScript...");
      const hqlAst = convertToHqlAst(expanded, { verbose: logger.enabled });
      const jsCode = await transformAST(hqlAst, baseDir, {
        verbose: logger.enabled,
        module: 'esm',
        bundle: false
      });
      
      console.log("\nJavaScript:");
      console.log("```javascript");
      console.log(jsCode);
      console.log("```");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${errorMessage}`);
    
    if (error instanceof Error && error.stack) {
      logger.debug(error.stack);
    }
  }
}

/**
 * Handle a special command in the REPL
 */
async function handleCommand(
  command: string,
  env: SEnv,
  history: string[],
  options: {
    logger: Logger;
    baseDir: string;
    showAst: boolean;
    showExpanded: boolean;
    showJs: boolean;
    running: () => boolean;
    setRunning: (value: boolean) => void;
    setVerbose: (value: boolean) => void;
    setShowAst: (value: boolean) => void;
    setShowExpanded: (value: boolean) => void;
    setShowJs: (value: boolean) => void;
  }
): Promise<void> {
  const { 
    logger, baseDir, showAst, showExpanded, showJs,
    running, setRunning, setVerbose, setShowAst, setShowExpanded, setShowJs
  } = options;
  
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  
  switch (cmd) {
    case ":help":
    case ":h":
      console.log("╔════════════════════════════════════════════════════════════╗");
      console.log("║                HQL S-Expression REPL Help                   ║");
      console.log("╠════════════════════════════════════════════════════════════╣");
      console.log("║  Commands:                                                  ║");
      console.log("║    :help, :h - Display this help                            ║");
      console.log("║    :quit, :exit, :q - Exit the REPL                         ║");
      console.log("║    :env - Show environment bindings                         ║");
      console.log("║    :macros - Show defined macros                            ║");
      console.log("║    :verbose - Toggle verbose mode                           ║");
      console.log("║    :ast - Toggle AST display                                ║");
      console.log("║    :expanded - Toggle expanded form display                 ║");
      console.log("║    :js - Toggle JavaScript output display                   ║");
      console.log("║    :load <filename> - Load and evaluate a file              ║");
      console.log("║    :save <filename> - Save history to a file                ║");
      console.log("║    :clear - Clear the screen                                ║");
      console.log("║                                                             ║");
      console.log("║  Write HQL expressions to evaluate them:                    ║");
      console.log("║    (+ 1 2)                                                  ║");
      console.log("║    (defn add [a b] (+ a b))                                 ║");
      console.log("║    (defmacro when [test & body] `(if ~test (do ~@body) nil))║");
      console.log("╚════════════════════════════════════════════════════════════╝");
      break;
      
    case ":quit":
    case ":exit":
    case ":q":
      setRunning(false);
      break;
      
    case ":env":
      // Display environment bindings (simplified)
      console.log("Environment bindings:");
      console.log("(This is a simplified view)");
      console.log();
      // This is a placeholder - in a real REPL, we'd need to expose the bindings from the environment
      break;
      
    case ":macros":
      // Display defined macros (simplified)
      console.log("Defined macros:");
      console.log("(This is a simplified view)");
      console.log();
      // This is a placeholder - in a real REPL, we'd need to expose the macros from the environment
      break;
      
    case ":verbose":
      setVerbose(!logger.enabled);
      console.log(`Verbose mode: ${logger.enabled ? "on" : "off"}`);
      break;
      
    case ":ast":
      setShowAst(!showAst);
      console.log(`AST display: ${showAst ? "on" : "off"}`);
      break;
      
    case ":expanded":
      setShowExpanded(!showExpanded);
      console.log(`Expanded form display: ${showExpanded ? "on" : "off"}`);
      break;
      
    case ":js":
      setShowJs(!showJs);
      console.log(`JavaScript output display: ${showJs ? "on" : "off"}`);
      break;
      
    case ":load":
      if (parts.length < 2) {
        console.error("Usage: :load <filename>");
        break;
      }
      
      try {
        const filename = parts.slice(1).join(" ");
        const content = await Deno.readTextFile(filename);
        console.log(`Loading file: ${filename}`);
        await processInput(content, env, history, {
          logger,
          baseDir,
          historySize: 1000, // Use a large history size for files
          showAst,
          showExpanded,
          showJs,
        });
      } catch (error) {
        console.error(`Error loading file: ${error instanceof Error ? error.message : String(error)}`);
      }
      break;
      
    case ":save":
      if (parts.length < 2) {
        console.error("Usage: :save <filename>");
        break;
      }
      
      try {
        const filename = parts.slice(1).join(" ");
        const content = history.join("\n");
        await Deno.writeTextFile(filename, content);
        console.log(`History saved to: ${filename}`);
      } catch (error) {
        console.error(`Error saving history: ${error instanceof Error ? error.message : String(error)}`);
      }
      break;
      
    case ":clear":
      // Clear the screen (works in most terminals)
      console.log("\x1Bc");
      break;
      
    default:
      console.error(`Unknown command: ${cmd}`);
      console.log("Type :help for available commands");
      break;
  }
}

// Run as script if invoked directly
if (import.meta.main) {
  startRepl({
    verbose: Deno.args.includes("--verbose") || Deno.args.includes("-v"),
    showAst: Deno.args.includes("--ast"),
    showExpanded: !Deno.args.includes("--no-expanded"),
    showJs: !Deno.args.includes("--no-js"),
  }).catch(console.error);
}