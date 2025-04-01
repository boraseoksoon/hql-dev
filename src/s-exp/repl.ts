// src/s-exp/repl.ts - Fixed version that avoids infinite loops and has proper keyboard handling

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { keypress } from "https://deno.land/x/cliffy@v0.25.4/keypress/mod.ts";
import { parse } from "../transpiler/parser.ts";
import { Environment } from "../environment.ts";
import { expandMacros } from "./macro.ts";
import { processImports } from "./imports.ts";
import { sexpToString } from "./types.ts";
import { Logger } from "../logger.ts";
import { convertToHqlAst } from "./macro-reader.ts";
import { transformAST } from "../transformer.ts";
import { loadSystemMacros } from "../transpiler/hql-transpiler.ts";
import { transformSyntax } from "../transpiler/syntax-transformer.ts";

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

// Globals to maintain state across evaluations
let replGlobals = {};

/**
 * Helper to print a block of output with a header.
 */
function printBlock(header: string, content: string) {
  console.log(header);
  console.log(content);
  console.log();
}

/**
 * Simple line editor with history support
 */
class LineEditor {
  private line = "";
  private position = 0;
  private history: string[] = [];
  private historyIndex = -1;
  private historySize: number;
  private prompt: string;
  private originalLine = "";

  constructor(prompt = "hql> ", historySize = 100) {
    this.prompt = prompt;
    this.historySize = historySize;
  }

  /**
   * Add a line to history
   */
  addToHistory(line: string): void {
    if (line.trim() && (this.history.length === 0 || line !== this.history[0])) {
      this.history.unshift(line);
      if (this.history.length > this.historySize) {
        this.history.pop();
      }
    }
    this.historyIndex = -1;
  }

  /**
   * Get the current history
   */
  getHistory(): string[] {
    return [...this.history];
  }

  /**
   * Set the prompt
   */
  setPrompt(prompt: string): void {
    this.prompt = prompt;
  }

  /**
   * Clear the line
   */
  clearLine(): void {
    this.line = "";
    this.position = 0;
  }

  /**
   * Move cursor left
   */
  moveLeft(): void {
    if (this.position > 0) {
      this.position--;
    }
  }

  /**
   * Move cursor right
   */
  moveRight(): void {
    if (this.position < this.line.length) {
      this.position++;
    }
  }

  /**
   * Move cursor to the start of the line
   */
  moveStart(): void {
    this.position = 0;
  }

  /**
   * Move cursor to the end of the line
   */
  moveEnd(): void {
    this.position = this.line.length;
  }

  /**
   * Insert character at current position
   */
  insertChar(char: string): void {
    this.line = this.line.slice(0, this.position) + char + this.line.slice(this.position);
    this.position++;
  }

  /**
   * Delete character at current position
   */
  deleteChar(): void {
    if (this.position < this.line.length) {
      this.line = this.line.slice(0, this.position) + this.line.slice(this.position + 1);
    }
  }

  /**
   * Delete character before current position (backspace)
   */
  backspace(): void {
    if (this.position > 0) {
      this.line = this.line.slice(0, this.position - 1) + this.line.slice(this.position);
      this.position--;
    }
  }

  /**
   * Move to previous history item
   */
  previousHistory(): void {
    if (this.historyIndex === -1) {
      this.originalLine = this.line;
    }
    
    if (this.historyIndex + 1 < this.history.length) {
      this.historyIndex++;
      this.line = this.history[this.historyIndex];
      this.position = this.line.length;
    }
  }

  /**
   * Move to next history item
   */
  nextHistory(): void {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.line = this.history[this.historyIndex];
      this.position = this.line.length;
    } else if (this.historyIndex === 0) {
      this.historyIndex = -1;
      this.line = this.originalLine;
      this.position = this.line.length;
    }
  }

  /**
   * Render the line with cursor position
   */
  render(): void {
    // Clear the current line
    Deno.stdout.writeSync(new TextEncoder().encode("\r\x1b[K"));
    
    // Print the prompt and line with cursor
    const before = this.line.slice(0, this.position);
    const after = this.line.slice(this.position);
    
    if (this.position < this.line.length) {
      // Cursor in middle of text
      Deno.stdout.writeSync(new TextEncoder().encode(
        `${this.prompt}${before}\x1b[7m${after[0]}\x1b[27m${after.slice(1)}`
      ));
    } else {
      // Cursor at end of text
      Deno.stdout.writeSync(new TextEncoder().encode(
        `${this.prompt}${this.line}\x1b[7m \x1b[27m`
      ));
    }
  }

  async readLine(): Promise<string> {
    // Clear current state
    this.line = "";
    this.position = 0;
    this.render();
  
    // Start reading keys using the new keypress async iterator
    for await (const key of keypress()) {
      if (key.ctrlKey) {
        switch (key.key) {
          case "c": // Ctrl+C
            console.log("^C");
            Deno.exit(0);
            break;
          case "d": // Ctrl+D (EOF)
            if (this.line.length === 0) {
              console.log("exit");
              return ":exit";
            }
            break;
          case "a": // Ctrl+A (beginning of line)
            this.moveStart();
            break;
          case "e": // Ctrl+E (end of line)
            this.moveEnd();
            break;
          case "k": // Ctrl+K (kill line)
            this.line = this.line.slice(0, this.position);
            break;
          case "l": // Ctrl+L (clear screen)
            console.log("\x1b[2J\x1b[0;0H"); // Clear screen and move cursor to top
            this.render();
            break;
        }
      } else {
        switch (key.key) {
          case "return": // Enter
            console.log(); // Move to next line
            const result = this.line;
            this.addToHistory(result);
            return result;
          case "backspace": // Backspace
            this.backspace();
            break;
          case "delete": // Delete
            this.deleteChar();
            break;
          case "left": // Left arrow
            this.moveLeft();
            break;
          case "right": // Right arrow
            this.moveRight();
            break;
          case "home": // Home
            this.moveStart();
            break;
          case "end": // End
            this.moveEnd();
            break;
          case "up": // Up arrow - only activate if line is empty or we're already in history mode
            if (this.line.length === 0 || this.historyIndex !== -1) {
              this.previousHistory();
            }
            break;
          case "down": // Down arrow - only activate if we're in history mode
            if (this.historyIndex !== -1) {
              this.nextHistory();
            }
            break;
          default:
            // Regular character input
            if (key.sequence && key.sequence.length === 1) {
              this.insertChar(key.sequence);
            }
        }
      }
      
      this.render();
    }
    
    return this.line;
  }

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
    "║    :globals - Show JavaScript global variables              ║",
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
  console.log(
    "║    :clear - Clear the screen                                ║",
  );
  console.log(
    "║    :reset - Reset global variables                          ║",
  );
  console.log("╚════════════════════════════════════════════════════════════╝");
}

/**
 * Start the interactive REPL.
 */
export async function startRepl(options: ReplOptions = {}): Promise<void> {
  const logger = new Logger(options.verbose || false);
  const baseDir = options.baseDir || Deno.cwd();
  const historySize = options.historySize || 100;
  
  // Display options
  let showAst = options.showAst ?? false;
  let showExpanded = options.showExpanded ?? false;
  let showJs = options.showJs ?? false;

  // Initialize our custom line editor
  const lineEditor = new LineEditor("hql> ", historySize);

  printBanner();

  // Initialize environment and load system macros
  logger.log({ text: "Initializing environment...", namespace: "repl" });

  try {
    // Initialize the global environment - this will be reused across all evaluations
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

    let multilineInput = "";
    let multilineMode = false;
    let parenBalance = 0;

    // Main REPL loop
    while (true) {
      try {
        // Adjust the prompt based on multiline mode
        const prompt = multilineMode ? "... " : "hql> ";
        lineEditor.setPrompt(prompt);
        
        // Get input with history and line editing support
        const line = await lineEditor.readLine();
        
        // Handle exit
        if (line === ":quit" || line === ":exit" || line === ":q") {
          console.log("\nGoodbye!");
          break;
        }
        
        // Handle multiline input
        if (multilineMode) {
          multilineInput += line + "\n";
          for (const char of line) {
            if (char === "(") parenBalance++;
            else if (char === ")") parenBalance--;
            else if (char === "[") parenBalance++;
            else if (char === "]") parenBalance--;
          }
          
          if (parenBalance <= 0) {
            multilineMode = false;
            await processInput(multilineInput, env, {
              logger,
              baseDir,
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
          const result = await handleCommand(line, env, lineEditor.getHistory(), {
            logger,
            baseDir,
            showAst,
            showExpanded,
            showJs,
          });
          
          // Update display settings if they were changed
          if (result) {
            showAst = result.showAst;
            showExpanded = result.showExpanded;
            showJs = result.showJs;
          }
          continue;
        }

        // Check for incomplete expressions to enable multiline mode
        for (const char of line) {
          if (char === "(") parenBalance++;
          else if (char === ")") parenBalance--;
          else if (char === "[") parenBalance++;
          else if (char === "]") parenBalance--;
        }
        
        if (parenBalance > 0) {
          multilineMode = true;
          multilineInput = line + "\n";
          continue;
        }

        // Process the input normally
        await processInput(line, env, {
          logger,
          baseDir,
          showAst,
          showExpanded,
          showJs,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${errMsg}`);
        if (error instanceof Error && error.stack) {
          logger.debug(error.stack);
        }
        multilineMode = false;
        multilineInput = "";
        parenBalance = 0;
      }
    }
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
  { logger, baseDir, showAst, showExpanded, showJs }: {
    logger: Logger;
    baseDir: string;
    showAst: boolean;
    showExpanded: boolean;
    showJs: boolean;
  },
): Promise<void> {
  if (!input.trim()) return;

  try {
    logger.debug("Parsing input...");
    const sexps = parse(input);
    if (sexps.length === 0) {
      console.log("No expressions to evaluate");
      return;
    }

    // Apply syntax transformations
    const transformedSexps = transformSyntax(sexps, { verbose: logger.enabled });

    // Optionally display the parsed AST.
    if (showAst) {
      printBlock("Parsed S-expressions:", transformedSexps.map(sexpToString).join("\n  "));
    }

    // Process imports if any
    await processImports(transformedSexps, env, {
      verbose: logger.enabled,
      baseDir,
      currentFile: baseDir,
    });

    logger.debug("Expanding macros...");
    const expanded = expandMacros(transformedSexps, env, { verbose: logger.enabled });
    
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

    // Evaluate the transpiled JavaScript with persistent globals
    logger.debug("Evaluating transpiled JavaScript...");
    
    let evalResult: any;
    // Replace the current evaluation code in the processInput function with this fixed version
    try {
      // First, examine the JS code being generated
      logger.debug(`Generated JS code: ${jsCode}`);
      
      // Create a wrapped version that ensures we get a proper return value
      const wrappedCode = `
        (function() {
          try {
            const result = ${jsCode};
            return result;
          } catch (e) {
            console.error("Internal evaluation error:", e);
            throw e;
          }
        })()
      `;
      
      // Simple eval - this approach has historically worked well
      evalResult = eval(wrappedCode);
      
      // Update globals if result is an object
      if (typeof evalResult === 'object' && evalResult !== null) {
        for (const key in evalResult) {
          replGlobals[key] = evalResult[key];
        }
      }
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
  }: {
    logger: Logger;
    baseDir: string;
    showAst: boolean;
    showExpanded: boolean;
    showJs: boolean;
  },
): Promise<{ showAst: boolean; showExpanded: boolean; showJs: boolean } | null> {
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case ":help":
    case ":h":
      printBanner();
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
    case ":globals":
      console.log("JavaScript Global Variables:\n");
      for (const [key, value] of Object.entries(replGlobals)) {
        console.log(`${key}: ${typeof value === 'function' ? '[Function]' : value}`);
      }
      break;
    case ":macros":
      console.log("Defined macros:\n");
      for (const key of env.macros.keys()) {
        console.log(`- ${key}`);
      }
      break;
    case ":verbose":
      logger.setEnabled(!logger.enabled);
      console.log(`Verbose mode: ${logger.enabled ? "on" : "off"}`);
      break;
    case ":ast":
      showAst = !showAst;
      console.log(`AST display: ${showAst ? "on" : "off"}`);
      return { showAst, showExpanded, showJs };
    case ":expanded":
      showExpanded = !showExpanded;
      console.log(`Expanded form display: ${showExpanded ? "on" : "off"}`);
      return { showAst, showExpanded, showJs };
    case ":js":
      showJs = !showJs;
      console.log(`JavaScript display: ${showJs ? "on" : "off"}`);
      return { showAst, showExpanded, showJs };
    case ":load":
      if (parts.length < 2) {
        console.error("Usage: :load <filename>");
        break;
      }
      try {
        const filename = parts.slice(1).join(" ");
        const content = await Deno.readTextFile(filename);
        console.log(`Loading file: ${filename}`);
        await processInput(content, env, {
          logger,
          baseDir,
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
      console.log("\x1b[2J\x1b[0;0H"); // Clear screen and move cursor to top
      break;
    case ":reset":
      // Reset the globals but keep the environment
      replGlobals = {};
      console.log("JavaScript global variables have been reset");
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      console.log("Type :help for available commands");
      break;
  }
  
  return null;
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