// src/s-exp/repl.ts - Updated to use stateful evaluator

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { Environment } from "../environment.ts";
import { sexpToString, SExp } from "./types.ts";
import { Logger } from "../logger.ts";
import { loadSystemMacros } from "../transpiler/hql-transpiler.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { REPLEvaluator, REPLEvalResult } from "./repl-evaluator.ts";

/**
 * Configuration for the REPL.
 */
interface ReplOptions {
  verbose?: boolean;
  baseDir?: string;
  historySize?: number;
  showAst?: boolean;
  showExpanded?: boolean;
  showJs?: boolean;
  initialFile?: string;
  useColors?: boolean;
}

// Terminal colors for improved output formatting
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",
  
  fg: {
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    crimson: "\x1b[38m"
  },
  
  bg: {
    black: "\x1b[40m",
    red: "\x1b[41m",
    green: "\x1b[42m",
    yellow: "\x1b[43m",
    blue: "\x1b[44m",
    magenta: "\x1b[45m",
    cyan: "\x1b[46m",
    white: "\x1b[47m",
    crimson: "\x1b[48m"
  }
};

/**
 * Helper to print a block of output with a header.
 */
function printBlock(header: string, content: string, useColors = false) {
  if (useColors) {
    console.log(`${colors.fg.cyan}${colors.bright}${header}${colors.reset}`);
    console.log(content);
    console.log();
  } else {
    console.log(header);
    console.log(content);
    console.log();
  }
}

/**
 * Displays the REPL banner.
 */
function printBanner(useColors = false): void {
  const headerColor = useColors ? `${colors.fg.green}${colors.bright}` : "";
  const textColor = useColors ? `${colors.fg.white}` : "";
  const commandColor = useColors ? `${colors.fg.yellow}` : "";
  const reset = useColors ? colors.reset : "";

  console.log(`${headerColor}╔════════════════════════════════════════════════════════════╗${reset}`);
  console.log(
    `${headerColor}║                ${textColor}HQL S-Expression REPL${headerColor}                        ║${reset}`,
  );
  console.log(`${headerColor}╠════════════════════════════════════════════════════════════╣${reset}`);
  console.log(
    `${headerColor}║  ${textColor}Type HQL expressions to evaluate them${headerColor}                      ║${reset}`,
  );
  console.log(
    `${headerColor}║  ${textColor}Special commands:${headerColor}                                          ║${reset}`,
  );
  console.log(
    `${headerColor}║    ${commandColor}:help${textColor} - Display this help${headerColor}                                ║${reset}`,
  );
  console.log(
    `${headerColor}║    ${commandColor}:quit${textColor}, ${commandColor}:exit${textColor} - Exit the REPL${headerColor}                             ║${reset}`,
  );
  console.log(
    `${headerColor}║    ${commandColor}:env${textColor} - Show environment bindings${headerColor}                         ║${reset}`,
  );
  console.log(
    `${headerColor}║    ${commandColor}:macros${textColor} - Show defined macros${headerColor}                            ║${reset}`,
  );
  console.log(
    `${headerColor}║    ${commandColor}:verbose${textColor} - Toggle verbose mode${headerColor}                           ║${reset}`,
  );
  console.log(
    `${headerColor}║    ${commandColor}:ast${textColor} - Toggle AST display${headerColor}                                ║${reset}`,
  );
  console.log(
    `${headerColor}║    ${commandColor}:expanded${textColor} - Toggle expanded form display${headerColor}                 ║${reset}`,
  );
  console.log(
    `${headerColor}║    ${commandColor}:js${textColor} - Toggle JavaScript output display${headerColor}                   ║${reset}`,
  );
  console.log(
    `${headerColor}║    ${commandColor}:load${textColor} <filename> - Load and evaluate a file${headerColor}              ║${reset}`,
  );
  console.log(
    `${headerColor}║    ${commandColor}:save${textColor} <filename> - Save history to a file${headerColor}                ║${reset}`,
  );
  console.log(
    `${headerColor}║    ${commandColor}:colors${textColor} - Toggle colorized output${headerColor}                        ║${reset}`,
  );
  console.log(
    `${headerColor}║    ${commandColor}:clear${textColor} - Clear the screen${headerColor}                                ║${reset}`,
  );
  console.log(`${headerColor}╚════════════════════════════════════════════════════════════╝${reset}`);
}

/**
 * Start the interactive REPL.
 */
export async function startRepl(options: ReplOptions = {}): Promise<void> {
  const logger = new Logger(options.verbose || false);
  const baseDir = options.baseDir || Deno.cwd();
  const historySize = options.historySize || 100;
  let showAst = options.showAst ?? false;
  let showExpanded = options.showExpanded ?? false;
  let showJs = options.showJs ?? false;
  let useColors = options.useColors ?? true;

  printBanner(useColors);

  // Initialize environment and load system macros
  logger.log({ text: "Initializing environment...", namespace: "repl" });

  try {
    // Initialize the global environment
    const env = await Environment.initializeGlobalEnv({
      verbose: options.verbose,
    });
    
    // Load system macros using the shared implementation
    await loadSystemMacros(env, {
      verbose: options.verbose,
      baseDir: Deno.cwd(),
    });
    
    // Create a stateful REPL evaluator
    const evaluator = new REPLEvaluator(env, {
      verbose: options.verbose,
      baseDir: baseDir,
      showAst,
      showExpanded,
      showJs,
    });
    
    // Display available macros
    if (options.verbose) {
      const macroKeys = Array.from(env.macros.keys());
      logger.log({ text: `Available macros: ${macroKeys.join(", ")}`, namespace: "repl" });
    }

    const history: string[] = [];
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let running = true;
    let multilineInput = "";
    let multilineMode = false;
    let parenBalance = 0;

    // Load initial file if specified
    if (options.initialFile) {
      try {
        await loadAndEvaluateFile(options.initialFile, evaluator, history, {
          logger,
          baseDir,
          historySize,
          showAst,
          showExpanded,
          showJs,
          useColors,
        });
      } catch (error) {
        console.error(`Error loading initial file: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    while (running) {
      try {
        const promptStyle = useColors ? `${colors.fg.green}${colors.bright}` : "";
        const resetStyle = useColors ? colors.reset : "";
        const prompt = multilineMode ? 
                       `${promptStyle}... ${resetStyle}` : 
                       `${promptStyle}hql> ${resetStyle}`;
        
        await Deno.stdout.write(encoder.encode(prompt));

        const buf = new Uint8Array(1024);
        const n = await Deno.stdin.read(buf);
        if (n === null) break;
        const line = decoder.decode(buf.subarray(0, n)).trim();

        // Handle multiline input.
        if (multilineMode) {
          multilineInput += line + "\n";
          for (const char of line) {
            if (char === "(") parenBalance++;
            else if (char === ")") parenBalance--;
          }
          if (parenBalance <= 0) {
            multilineMode = false;
            await processInput(multilineInput, evaluator, history, {
              logger,
              baseDir,
              historySize,
              showAst,
              showExpanded,
              showJs,
              useColors,
            });
            multilineInput = "";
            parenBalance = 0;
          }
          continue;
        }

        // Handle special commands.
        if (line.startsWith(":")) {
          await handleCommand(line, evaluator, history, {
            logger,
            baseDir,
            showAst,
            showExpanded,
            showJs,
            useColors,
            running: () => running,
            setRunning: (value) => {
              running = value;
            },
            setVerbose: (value) => {
              logger.setEnabled(value);
            },
            setColors: (value) => {
              useColors = value;
            },
            setShowAst: (value) => {
              showAst = value;
            },
            setShowExpanded: (value) => {
              showExpanded = value;
            },
            setShowJs: (value) => {
              showJs = value;
            }
          });
          continue;
        }

        // Check if input is incomplete.
        for (const char of line) {
          if (char === "(") parenBalance++;
          else if (char === ")") parenBalance--;
        }
        if (parenBalance > 0) {
          multilineMode = true;
          multilineInput = line + "\n";
          continue;
        }

        await processInput(line, evaluator, history, {
          logger,
          baseDir,
          historySize,
          showAst,
          showExpanded,
          showJs,
          useColors,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (useColors) {
          console.error(`${colors.fg.red}Error: ${errMsg}${colors.reset}`);
        } else {
          console.error(`Error: ${errMsg}`);
        }
        multilineMode = false;
        multilineInput = "";
        parenBalance = 0;
      }
    }
    console.log("\nGoodbye!");
  } catch (error) {
    console.error(`REPL initialization error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  }
}

/**
 * Process a single input line: parse, expand, transpile, evaluate, and print output.
 */
async function processInput(
  input: string,
  evaluator: REPLEvaluator,
  history: string[],
  { logger, baseDir, historySize, showAst, showExpanded, showJs, useColors }: {
    logger: Logger;
    baseDir: string;
    historySize: number;
    showAst: boolean;
    showExpanded: boolean;
    showJs: boolean;
    useColors: boolean;
  },
): Promise<void> {
  if (!input.trim()) return;
  if (history.length >= historySize) history.shift();
  history.push(input);

  try {
    // Evaluate the input using our stateful evaluator
    const result = await evaluator.evaluate(input, {
      verbose: logger.isVerbose,
      baseDir,
      showAst,
      showExpanded,
      showJs,
    });

    // Show JS output only when verbose or showJs is enabled
    if (logger.isVerbose || showJs) {
      console.log("Generated JavaScript:");
      console.log("---------------------");
      console.log(result.jsCode);
      console.log("---------------------");
    }

    // Optionally display the parsed AST
    if (showAst) {
      printBlock("Parsed S-expressions:", result.parsedExpressions.map(sexpToString).join("\n  "), useColors);
    }

    // Optionally display the expanded form
    if (showExpanded) {
      printBlock("Macro-expanded form:", result.expandedExpressions.map(sexpToString).join("\n  "), useColors);
    }

    // Display the result
    if (useColors) {
      console.log(`${colors.fg.green}${colors.bright}=> ${colors.reset}${colors.fg.cyan}${result.value !== undefined ? result.value : 'undefined'}${colors.reset}`);
    } else {
      console.log(`=> ${result.value !== undefined ? result.value : 'undefined'}`);
    }
    
    // Show environment state only in verbose mode
    if (logger.isVerbose) {
      console.log("Environment state:");
      console.log("------------------");
      const envSymbols = evaluator.getEnvironment().getDefinedSymbols();
      console.log(`Defined symbols: ${envSymbols.join(", ") || "none"}`);
      console.log("------------------");
    }
  } catch (error) {
    if (useColors) {
      console.error(`${colors.fg.red}Error: ${error instanceof Error ? error.message : String(error)}${colors.reset}`);
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (error instanceof Error && error.stack && logger.isVerbose) {
      console.error(error.stack);
    }
  }
}

/**
 * Load and evaluate a file.
 */
async function loadAndEvaluateFile(
  filePath: string,
  evaluator: REPLEvaluator,
  history: string[],
  options: {
    logger: Logger;
    baseDir: string;
    historySize: number;
    showAst: boolean;
    showExpanded: boolean;
    showJs: boolean;
    useColors: boolean;
  },
): Promise<void> {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(options.baseDir, filePath);

  if (!await exists(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const fileContent = await Deno.readTextFile(resolvedPath);
  if (options.useColors) {
    console.log(`${colors.fg.yellow}Loading file: ${resolvedPath}${colors.reset}`);
  } else {
    console.log(`Loading file: ${resolvedPath}`);
  }
  
  await processInput(fileContent, evaluator, history, options);
}

/**
 * Handle special REPL commands.
 */
async function handleCommand(
  command: string,
  evaluator: REPLEvaluator,
  history: string[],
  {
    logger,
    baseDir,
    showAst,
    showExpanded,
    showJs,
    useColors,
    running,
    setRunning,
    setVerbose,
    setColors,
    setShowAst,
    setShowExpanded,
    setShowJs,
  }: {
    logger: Logger;
    baseDir: string;
    showAst: boolean;
    showExpanded: boolean;
    showJs: boolean;
    useColors: boolean;
    running: () => boolean;
    setRunning: (value: boolean) => void;
    setVerbose: (value: boolean) => void;
    setColors: (value: boolean) => void;
    setShowAst: (value: boolean) => void;
    setShowExpanded: (value: boolean) => void;
    setShowJs: (value: boolean) => void;
  },
): Promise<void> {
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case ":help":
      printBanner(useColors);
      break;

    case ":exit":
    case ":quit":
      setRunning(false);
      break;

    case ":env":
      // Get defined symbols from the REPL environment
      const replEnv = evaluator.getEnvironment();
      const definedSymbols = replEnv.getDefinedSymbols();
      
      // Format the bindings output
      const bindingString = definedSymbols.length > 0 
        ? definedSymbols.map(name => {
            const value = replEnv.getJsValue(name);
            return `${name}: ${typeof value === "function" ? "<function>" : value}`;
          }).join("\n")
        : "No bindings";
      
      printBlock("Environment Bindings:", bindingString, useColors);
      break;

    case ":macros":
      const macroKeys = Array.from(evaluator.getEnvironment().hqlEnv.macros.keys());
      printBlock("Defined Macros:", macroKeys.join(", ") || "No macros defined", useColors);
      break;

    case ":verbose":
      const newVerbose = !logger.enabled;
      setVerbose(newVerbose);
      if (useColors) {
        console.log(`${colors.fg.yellow}Verbose mode ${newVerbose ? "enabled" : "disabled"}${colors.reset}`);
      } else {
        console.log(`Verbose mode ${newVerbose ? "enabled" : "disabled"}`);
      }
      break;

    case ":ast":
      setShowAst(!showAst);
      if (useColors) {
        console.log(`${colors.fg.yellow}AST display ${!showAst ? "enabled" : "disabled"}${colors.reset}`);
      } else {
        console.log(`AST display ${!showAst ? "enabled" : "disabled"}`);
      }
      break;

    case ":expanded":
      setShowExpanded(!showExpanded);
      if (useColors) {
        console.log(`${colors.fg.yellow}Expanded form display ${!showExpanded ? "enabled" : "disabled"}${colors.reset}`);
      } else {
        console.log(`Expanded form display ${!showExpanded ? "enabled" : "disabled"}`);
      }
      break;

    case ":js":
      setShowJs(!showJs);
      if (useColors) {
        console.log(`${colors.fg.yellow}JavaScript output display ${!showJs ? "enabled" : "disabled"}${colors.reset}`);
      } else {
        console.log(`JavaScript output display ${!showJs ? "enabled" : "disabled"}`);
      }
      break;

    case ":load":
      if (parts.length < 2) {
        if (useColors) {
          console.error(`${colors.fg.red}Error: Missing filename${colors.reset}`);
        } else {
          console.error("Error: Missing filename");
        }
        return;
      }
      
      try {
        await loadAndEvaluateFile(parts[1], evaluator, history, {
          logger,
          baseDir,
          historySize: history.length,
          showAst,
          showExpanded,
          showJs,
          useColors,
        });
      } catch (error) {
        if (useColors) {
          console.error(`${colors.fg.red}Error loading file: ${error instanceof Error ? error.message : String(error)}${colors.reset}`);
        } else {
          console.error(`Error loading file: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      break;

    case ":save":
      if (parts.length < 2) {
        if (useColors) {
          console.error(`${colors.fg.red}Error: Missing filename${colors.reset}`);
        } else {
          console.error("Error: Missing filename");
        }
        return;
      }
      
      try {
        const savePath = path.isAbsolute(parts[1])
          ? parts[1]
          : path.join(baseDir, parts[1]);
        
        await Deno.writeTextFile(savePath, history.join("\n"));
        if (useColors) {
          console.log(`${colors.fg.green}History saved to ${savePath}${colors.reset}`);
        } else {
          console.log(`History saved to ${savePath}`);
        }
      } catch (error) {
        if (useColors) {
          console.error(`${colors.fg.red}Error saving history: ${error instanceof Error ? error.message : String(error)}${colors.reset}`);
        } else {
          console.error(`Error saving history: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      break;

    case ":colors":
      setColors(!useColors);
      console.log(`Colors ${!useColors ? "enabled" : "disabled"}`);
      break;

    case ":clear":
      console.clear();
      break;

    default:
      if (useColors) {
        console.error(`${colors.fg.red}Unknown command: ${cmd}${colors.reset}`);
      } else {
        console.error(`Unknown command: ${cmd}`);
      }
      break;
  }
}

// Only start the REPL if this module is the main module
if (import.meta.main) {
  startRepl();
}