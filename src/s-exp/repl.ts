// src/s-exp/repl.ts - Updated to use system macro loading

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { parse } from "../transpiler/parser.ts";
import { Environment } from "../environment.ts";
import { expandMacros } from "./macro.ts";
import { processImports } from "./imports.ts";
import { sexpToString } from "./types.ts";
import { Logger } from "../logger.ts";
import { convertToHqlAst } from "./macro-reader.ts";
import { transformAST } from "../transformer.ts";
import { loadSystemMacros } from "../transpiler/hql-transpiler.ts";

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
}

/**
 * Helper to print a block of output with a header.
 */
function printBlock(header: string, content: string) {
  console.log(header);
  console.log(content);
  console.log();
}

/**
 * Displays the REPL banner.
 */
function printBanner(): void {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log(
    "║                HQL S-Expression REPL                        ║",
  );
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(
    "║  Type HQL expressions to evaluate them                      ║",
  );
  console.log(
    "║  Special commands:                                          ║",
  );
  console.log(
    "║    :help - Display this help                                ║",
  );
  console.log(
    "║    :quit, :exit - Exit the REPL                             ║",
  );
  console.log(
    "║    :env - Show environment bindings                         ║",
  );
  console.log(
    "║    :macros - Show defined macros                            ║",
  );
  console.log(
    "║    :verbose - Toggle verbose mode                           ║",
  );
  console.log(
    "║    :ast - Toggle AST display                                ║",
  );
  console.log(
    "║    :expanded - Toggle expanded form display                 ║",
  );
  console.log(
    "║    :js - Toggle JavaScript output display                   ║",
  );
  console.log(
    "║    :load <filename> - Load and evaluate a file              ║",
  );
  console.log(
    "║    :save <filename> - Save history to a file                ║",
  );
  console.log("╚════════════════════════════════════════════════════════════╝");
}

/**
 * Start the interactive REPL.
 */
export async function startRepl(options: ReplOptions = {}): Promise<void> {
  const logger = new Logger(options.verbose || false);
  const baseDir = options.baseDir || Deno.cwd();
  const historySize = options.historySize || 50;
  // By default, do not show AST, expanded forms, or transpiled JavaScript.
  const showAst = options.showAst ?? false;
  const showExpanded = options.showExpanded ?? false;
  const showJs = options.showJs ?? false;

  printBanner();

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

    while (running) {
      try {
        const prompt = multilineMode ? "... " : "hql> ";
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

        // Handle special commands.
        if (line.startsWith(":")) {
          await handleCommand(line, env, history, {
            logger,
            baseDir,
            showAst,
            showExpanded,
            showJs,
            running: () => running,
            setRunning: (value) => {
              running = value;
            },
            setVerbose: (value) => {
              logger.setEnabled(value);
            },
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

        await processInput(line, env, history, {
          logger,
          baseDir,
          historySize,
          showAst,
          showExpanded,
          showJs,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${errMsg}`);
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
  env: Environment,
  history: string[],
  { logger, baseDir, historySize, showAst, showExpanded, showJs }: {
    logger: Logger;
    baseDir: string;
    historySize: number;
    showAst: boolean;
    showExpanded: boolean;
    showJs: boolean;
  },
): Promise<void> {
  if (!input.trim()) return;
  if (history.length >= historySize) history.shift();
  history.push(input);

  try {
    logger.debug("Parsing input...");
    const sexps = parse(input);
    if (sexps.length === 0) {
      console.log("No expressions to evaluate");
      return;
    }

    // Optionally display the parsed AST.
    if (showAst) {
      printBlock("Parsed S-expressions:", sexps.map(sexpToString).join("\n  "));
    }

    // Process imports if any
    await processImports(sexps, env, {
      verbose: logger.enabled,
      baseDir,
      currentFile: baseDir,
    });

    logger.debug("Expanding macros...");
    const expanded = expandMacros(sexps, env, { verbose: logger.enabled });
    
    // Optionally display expanded forms.
    if (showExpanded) {
      printBlock("Expanded forms:", expanded.map(sexpToString).join("\n  "));
    }

    // Convert to AST
    logger.debug("Converting to HQL AST...");
    const hqlAst = convertToHqlAst(expanded, { verbose: logger.enabled });

    // Transform to JavaScript
    logger.debug("Transforming to JavaScript...");
    const jsCode = await transformAST(hqlAst, baseDir, { verbose: logger.enabled });

    // Optionally display transpiled JavaScript.
    if (showJs) {
      printBlock("JavaScript:", "```javascript\n" + jsCode + "\n```");
    }

    // Evaluate the transpiled JavaScript.
    logger.debug("Evaluating transpiled JavaScript...");
    let evalResult: any;
    try {
      // Using eval; note that this assumes the transpiled code is a simple expression.
      evalResult = eval(jsCode);
    } catch (e) {
      console.error("Error during JavaScript evaluation:", e);
      return;
    }

    console.log("=> ", evalResult);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${errMsg}`);
    if (error instanceof Error && error.stack) logger.debug(error.stack);
  }
}

/**
 * Handle special REPL commands.
 */
async function handleCommand(
  command: string,
  env: Environment,
  history: string[],
  {
    logger,
    baseDir,
    showAst,
    showExpanded,
    showJs,
    running,
    setRunning,
    setVerbose,
  }: {
    logger: Logger;
    baseDir: string;
    showAst: boolean;
    showExpanded: boolean;
    showJs: boolean;
    running: () => boolean;
    setRunning: (value: boolean) => void;
    setVerbose: (value: boolean) => void;
  },
): Promise<void> {
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case ":help":
    case ":h":
      printBanner();
      break;
    case ":quit":
    case ":exit":
    case ":q":
      setRunning(false);
      break;
    case ":env":
      console.log("Environment bindings: (simplified view)\n");
      for (const [key, value] of env.variables.entries()) {
        if (typeof value === "function") {
          console.log(`${key}: [Function]`);
        } else {
          console.log(`${key}: ${value}`);
        }
      }
      break;
    case ":macros":
      console.log("Defined macros:\n");
      for (const key of env.macros.keys()) {
        console.log(`- ${key}`);
      }
      break;
    case ":verbose":
      setVerbose(!logger.enabled);
      console.log(`Verbose mode: ${logger.enabled ? "on" : "off"}`);
      break;
    case ":ast":
      console.log(`AST display: ${!showAst ? "on" : "off"}`);
      return { showAst: !showAst, showExpanded, showJs };
    case ":expanded":
      console.log(`Expanded form display: ${!showExpanded ? "on" : "off"}`);
      return { showAst, showExpanded: !showExpanded, showJs };
    case ":js":
      console.log(`JavaScript display: ${!showJs ? "on" : "off"}`);
      return { showAst, showExpanded, showJs: !showJs };
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
          historySize: 1000,
          showAst,
          showExpanded,
          showJs,
        });
      } catch (error) {
        console.error(
          `Error loading file: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      break;
    case ":save":
      if (parts.length < 2) {
        console.error("Usage: :save <filename>");
        break;
      }
      try {
        const filename = parts.slice(1).join(" ");
        await Deno.writeTextFile(filename, history.join("\n"));
        console.log(`History saved to: ${filename}`);
      } catch (error) {
        console.error(
          `Error saving history: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      break;
    case ":clear":
      console.log("\x1Bc");
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      console.log("Type :help for available commands");
      break;
  }
  
  // Return the same settings for commands that don't change them
  return { showAst, showExpanded, showJs };
}

// Run as script if invoked directly.
if (import.meta.main) {
  startRepl({
    verbose: Deno.args.includes("--verbose") || Deno.args.includes("-v"),
    showAst: Deno.args.includes("--ast"),
    showExpanded: Deno.args.includes("--expanded"),
    showJs: Deno.args.includes("--js"),
  }).catch(console.error);
}