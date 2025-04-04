// src/s-exp/repl.ts - Updated to use stateful evaluator

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { keypress } from "https://deno.land/x/cliffy@v1.0.0-rc.3/keypress/mod.ts";
import { Logger } from "../logger.ts";
import { Environment } from "../environment.ts";
import { REPLEvaluator } from "./repl-evaluator.ts";
import { loadSystemMacros } from "../transpiler/hql-transpiler.ts";
import { formatError, getSuggestion, registerSourceFile } from "../transpiler/error/error-handling.ts";

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

// Define SICP book-inspired color scheme
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
    // SICP red - brighter red for better readability
    sicpRed: "\x1b[38;2;220;50;47m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    crimson: "\x1b[38m",
    // SICP purple (darker/richer purple than before)
    sicpPurple: "\x1b[38;2;128;0;128m",
    // Add light color variations
    lightBlue: "\x1b[94m",
    lightGreen: "\x1b[92m", 
    lightYellow: "\x1b[93m",
    lightPurple: "\x1b[95m",
    lightCyan: "\x1b[96m"
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
    crimson: "\x1b[48m",
    // Background SICP colors
    sicpRed: "\x1b[48;2;220;50;47m",
    sicpPurple: "\x1b[48;2;128;0;128m"
  }
};

/**
 * Helper to print a block of output with a header.
 */
function printBlock(header: string, content: string, useColors = false) {
  if (useColors) {
    console.log(`${colors.fg.sicpRed}${colors.bright}${header}${colors.reset}`);
    console.log(content);
    console.log();
  } else {
    console.log(header);
    console.log(content);
    console.log();
  }
}

/**
 * Helper function to print colored text
 */
function colorText(text: string, colorCode: string, useColors = true): string {
  return useColors ? `${colorCode}${text}${colors.reset}` : text;
}

/**
 * Displays the REPL banner.
 */
function printBanner(useColors = false): void {
  const headerColor = useColors ? colors.fg.sicpPurple + colors.bright : "";
  const textColor = useColors ? colors.fg.white : "";
  const commandColor = useColors ? colors.fg.sicpRed : "";
  const reset = useColors ? colors.reset : "";

  const boxLines = [
    `${headerColor}╔════════════════════════════════════════════════════════════╗${reset}`,
    `${headerColor}║                ${textColor}HQL S-Expression REPL${headerColor}                        ║${reset}`,
    `${headerColor}╠════════════════════════════════════════════════════════════╣${reset}`,
    `${headerColor}║  ${textColor}Type HQL expressions to evaluate them${headerColor}                      ║${reset}`,
    `${headerColor}║  ${textColor}Special commands:${headerColor}                                          ║${reset}`,
    `${headerColor}║    ${commandColor}:help${textColor} - Display this help${headerColor}                                ║${reset}`,
    `${headerColor}║    ${commandColor}:quit${textColor}, ${commandColor}:exit${textColor} - Exit the REPL${headerColor}                             ║${reset}`,
    `${headerColor}║    ${commandColor}:env${textColor} - Show environment bindings${headerColor}                         ║${reset}`,
    `${headerColor}║    ${commandColor}:macros${textColor} - Show defined macros${headerColor}                            ║${reset}`,
    `${headerColor}║    ${commandColor}:verbose${textColor} - Toggle verbose mode${headerColor}                           ║${reset}`,
    `${headerColor}║    ${commandColor}:ast${textColor} - Toggle AST display${headerColor}                                ║${reset}`,
    `${headerColor}║    ${commandColor}:expanded${textColor} - Toggle expanded form display${headerColor}                 ║${reset}`,
    `${headerColor}║    ${commandColor}:js${textColor} - Toggle JavaScript output display${headerColor}                   ║${reset}`,
    `${headerColor}║    ${commandColor}:load${textColor} <filename> - Load and evaluate a file${headerColor}              ║${reset}`,
    `${headerColor}║    ${commandColor}:save${textColor} <filename> - Save history to a file${headerColor}                ║${reset}`,
    `${headerColor}║    ${commandColor}:colors${textColor} - Toggle colorized output${headerColor}                        ║${reset}`,
    `${headerColor}║    ${commandColor}:clear${textColor} - Clear the screen${headerColor}                                ║${reset}`,
    `${headerColor}╚════════════════════════════════════════════════════════════╝${reset}`
  ];

  boxLines.forEach(line => console.log(line));
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
  
  // REPL state variables
  let running = true;
  let multilineInput = "";
  let multilineMode = false;
  let parenBalance = 0;

  function resetReplState() {
    multilineMode = false;
    multilineInput = "";
    parenBalance = 0;
  }

  function printError(message: string, useColors: boolean) {
    if (useColors) {
      console.error(`${colors.fg.red}${message}${colors.reset}`);
    } else {
      console.error(message);
    }
  }

  // Track symbol usage for potential future auto-completion
  const trackSymbolUsage = (symbol: string) => {
    // Just a placeholder for now
    logger.debug(`Symbol used: ${symbol}`);
  };

  // Auto-save history function
  const autoSaveHistory = async () => {
    // Placeholder for future auto-save functionality
  };
  
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

    // REPL history
    const history: string[] = [];

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

    // Common handler for REPL state changes
    const replState = {
      running: () => running,
      setRunning: (value: boolean) => { running = value; },
      setVerbose: (value: boolean) => { logger.setEnabled(value); },
      setColors: (value: boolean) => { useColors = value; },
      setShowAst: (value: boolean) => { showAst = value; },
      setShowExpanded: (value: boolean) => { showExpanded = value; },
      setShowJs: (value: boolean) => { showJs = value; }
    };

    while (running) {
      try {
        const promptStyle = useColors ? `${colors.fg.sicpPurple}${colors.bright}` : "";
        const resetStyle = useColors ? colors.reset : "";
        const prompt = multilineMode ? 
                       `${promptStyle}... ${resetStyle}` : 
                       `${promptStyle}hql> ${resetStyle}`;
        
        // Use the enhanced line reader with history support
        const line = await readLineWithHistory(prompt, history);
        
        // Handle empty input
        if (!line.trim()) continue;
        
        // Update paren balance (counting open and closed parens)
        for (const char of line) {
          if (char === "(") parenBalance++;
          else if (char === ")") parenBalance--;
        }

        // Handle multiline input
        if (multilineMode) {
          multilineInput += line + "\n";
          
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
              trackSymbolUsage, // Pass the symbol tracker
            });
            multilineInput = "";
            parenBalance = 0;
          }
          continue;
        }

        // Handle special commands
        if (line.startsWith(":")) {
          await handleCommand(line, evaluator, history, {
            ...replState,
            logger,
            baseDir,
            showAst,
            showExpanded,
            showJs,
            useColors,
          });
          continue;
        }

        // Check if input is incomplete (mismatched parentheses)
        if (parenBalance > 0) {
          multilineMode = true;
          multilineInput = line + "\n";
          continue;
        }

        // Process complete input
        await processInput(line, evaluator, history, {
          logger,
          baseDir,
          historySize,
          showAst,
          showExpanded,
          showJs,
          useColors,
          trackSymbolUsage, // Pass the symbol tracker
        });
      } catch (error) {
        printError(`Error: ${error instanceof Error ? error.message : String(error)}`, useColors);
        resetReplState();
      }
    }
    
    // Auto-save history when exiting
    await autoSaveHistory();
    
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
  { logger, baseDir, historySize, showAst, showExpanded, showJs, useColors, trackSymbolUsage }: {
    logger: Logger;
    baseDir: string;
    historySize: number;
    showAst: boolean;
    showExpanded: boolean;
    showJs: boolean;
    useColors: boolean;
    trackSymbolUsage?: (symbol: string) => void;
  },
): Promise<void> {
  // Add input to history if non-empty and different from the last entry
  if (input.trim() && (history.length === 0 || history[history.length - 1] !== input.trim())) {
    history.push(input.trim());
    // Keep history size limited
    if (history.length > historySize) {
      history.shift();
    }
  }

  try {
    // Register the source for error enhancement
    registerSourceFile("REPL input", input);
    
    const result = await evaluator.evaluate(input, { showAst, showExpanded, showJs });

    // Detect function definitions for better feedback
    const isFunctionDefinition = input.trim().startsWith("(fn ") || input.trim().startsWith("(defn ");
    const isVariableDefinition = input.trim().startsWith("(def ");
    
    // Handle different result types
    if (result.value !== undefined) {
      let displayValue = result.value;

      if (useColors) {
        if (displayValue === null) {
          displayValue = `${colors.fg.lightBlue}null${colors.reset}`;
        } else if (typeof displayValue === "number") {
          displayValue = `${colors.fg.lightGreen}${displayValue}${colors.reset}`;
        } else if (typeof displayValue === "string") {
          displayValue = `${colors.fg.lightYellow}"${displayValue}"${colors.reset}`;
        } else if (typeof displayValue === "boolean") {
          displayValue = `${colors.fg.lightPurple}${displayValue}${colors.reset}`;
        } else if (Array.isArray(displayValue)) {
          // Pretty-print arrays
          try {
            displayValue = `${colors.fg.lightCyan}${JSON.stringify(displayValue, null, 2)}${colors.reset}`;
          } catch (e) {
            // If JSON.stringify fails, use toString
            displayValue = `${colors.fg.lightCyan}${displayValue}${colors.reset}`;
          }
        } else if (typeof displayValue === "object") {
          // Pretty-print objects
          try {
            displayValue = `${colors.fg.lightCyan}${JSON.stringify(displayValue, null, 2)}${colors.reset}`;
          } catch (e) {
            // If JSON.stringify fails, use toString
            displayValue = `${colors.fg.lightCyan}${displayValue}${colors.reset}`;
          }
        }
      }

      console.log(displayValue);
    } else if (isFunctionDefinition) {
      // Extract function name from a function definition for better feedback
      const match = input.trim().match(/\(fn\s+([a-zA-Z0-9_-]+)/);
      const defnMatch = input.trim().match(/\(defn\s+([a-zA-Z0-9_-]+)/);
      const functionName = match ? match[1] : (defnMatch ? defnMatch[1] : "anonymous");
      
      if (useColors) {
        console.log(`${colors.fg.lightGreen}Function ${functionName} defined${colors.reset}`);
      } else {
        console.log(`Function ${functionName} defined`);
      }
    } else if (isVariableDefinition) {
      // Extract variable name from a definition
      const match = input.trim().match(/\(def\s+([a-zA-Z0-9_-]+)/);
      const varName = match ? match[1] : "value";
      
      if (useColors) {
        console.log(`${colors.fg.lightGreen}Variable ${varName} defined${colors.reset}`);
      } else {
        console.log(`Variable ${varName} defined`);
      }
    } else if (result.value === undefined) {
      // For undefined results that aren't function definitions, provide feedback
      if (useColors) {
        console.log(`${colors.fg.lightBlue}undefined${colors.reset}`);
      } else {
        console.log("undefined");
      }
    }
    
    // Show additional debug information if requested
    if (showAst) {
      printBlock("AST:", JSON.stringify(result.parsedExpressions, null, 2), useColors);
    }
    if (showExpanded) {
      printBlock("Expanded:", JSON.stringify(result.expandedExpressions, null, 2), useColors);
    }
    if (showJs) {
      printBlock("JavaScript:", result.jsCode, useColors);
    }
    
    // Track symbol usage for potential future auto-completion
    if (trackSymbolUsage) {
      const symbolRegex = /\b[a-zA-Z0-9_-]+\b/g;
      let match;
      while ((match = symbolRegex.exec(input)) !== null) {
        trackSymbolUsage(match[0]);
      }
    }
  } catch (error) {
    // Format error message using our enhanced error formatter
    if (error instanceof Error) {
      const formattedError = formatError(error, { 
        useColors,
        filePath: "REPL input"
      });
      
      // Add a helpful suggestion
      const suggestion = getSuggestion(error);
      
      if (useColors) {
        console.error(`${colors.fg.red}${formattedError}${colors.reset}`);
        console.error(`${colors.fg.cyan}Suggestion: ${suggestion}${colors.reset}`);
      } else {
        console.error(formattedError);
        console.error(`Suggestion: ${suggestion}`);
      }
    } else {
      // For non-Error objects
      if (useColors) {
        console.error(`${colors.fg.red}Error: ${String(error)}${colors.reset}`);
      } else {
        console.error(`Error: ${String(error)}`);
      }
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
    console.log(`${colors.fg.sicpRed}Loading file: ${resolvedPath}${colors.reset}`);
  } else {
    console.log(`Loading file: ${resolvedPath}`);
  }
  
  await processInput(fileContent, evaluator, history, options);
}

/**
 * Handle REPL commands.
 */
async function handleCommand(
  command: string,
  evaluator: REPLEvaluator,
  history: string[],
  {
    running: isRunning,
    setRunning,
    setVerbose,
    setColors,
    setShowAst,
    setShowExpanded,
    setShowJs,
    logger,
    baseDir,
    showAst,
    showExpanded,
    showJs,
    useColors,
  }: {
    running: () => boolean;
    setRunning: (value: boolean) => void;
    setVerbose: (value: boolean) => void;
    setColors: (value: boolean) => void;
    setShowAst: (value: boolean) => void;
    setShowExpanded: (value: boolean) => void;
    setShowJs: (value: boolean) => void;
    logger: Logger;
    baseDir: string;
    showAst: boolean;
    showExpanded: boolean;
    showJs: boolean;
    useColors: boolean;
  },
): Promise<void> {
  const parts = command.split(" ");
  const cmd = parts[0];
  
  switch (cmd) {
    case ":help":
    case ":h":
      printBanner(useColors);
      break;
      
    case ":quit":
    case ":exit":
    case ":q":
      setRunning(false);
      break;
      
    case ":env": {
      // Get environment from evaluator
      const _env = evaluator.getEnvironment();
      console.log(colorText("Environment bindings:", colors.fg.sicpRed + colors.bright, useColors));
      
      // Display environment variables safely
      console.log("Defined symbols:");
      console.log("----------------");
      try {
        // Simply display that we can't access symbols directly
        console.log("(Environment symbol information not directly accessible in this view)");
        console.log("Use JavaScript to inspect variables with (js ...)");
      } catch (error) {
        console.error(`Error accessing environment: ${error instanceof Error ? error.message : String(error)}`);
      }
      console.log("----------------");
      break;
    }
      
    case ":macros": {
      console.log(colorText("Defined macros:", colors.fg.sicpRed + colors.bright, useColors));
      const environment = evaluator.getEnvironment();
      
      try {
        console.log("Macro names:");
        console.log("------------");
        // Check if macros property exists on environment
        if (environment && 'macros' in environment && environment.macros instanceof Map) {
          const macroKeys = Array.from(environment.macros.keys());
          if (macroKeys.length > 0) {
            for (const macroName of macroKeys) {
              console.log(`- ${macroName}`);
            }
          } else {
            console.log("No macros defined");
          }
        } else {
          console.log("Macro information not available");
        }
        console.log("------------");
      } catch (error) {
        console.error(`Error accessing macros: ${error instanceof Error ? error.message : String(error)}`);
      }
      break;
    }
      
    case ":verbose":
      setVerbose(!logger.isVerbose);
      console.log(`Verbose mode ${logger.isVerbose ? "enabled" : "disabled"}`);
      break;
      
    case ":ast":
      setShowAst(!showAst);
      console.log(`AST display ${showAst ? "enabled" : "disabled"}`);
      break;
      
    case ":expanded":
      setShowExpanded(!showExpanded);
      console.log(`Expanded form display ${showExpanded ? "enabled" : "disabled"}`);
      break;
      
    case ":js":
      setShowJs(!showJs);
      console.log(`JavaScript output display ${showJs ? "enabled" : "disabled"}`);
      break;
      
    case ":load": {
      if (parts.length < 2) {
        console.error("Usage: :load <filename>");
        return;
      }
      
      const filePath = parts.slice(1).join(" ");
      console.log(`Loading file: ${filePath}`);
      
      try {
        await loadAndEvaluateFile(filePath, evaluator, history, {
          logger,
          baseDir,
          historySize: 100,
          showAst,
          showExpanded,
          showJs,
          useColors,
        });
        console.log(`File loaded successfully: ${filePath}`);
      } catch (error) {
        console.error(`Error loading file: ${error instanceof Error ? error.message : String(error)}`);
      }
      break;
    }
      
    case ":save": {
      if (parts.length < 2) {
        console.error("Usage: :save <filename>");
        return;
      }
      
      const saveFilePath = parts.slice(1).join(" ");
      try {
        await Deno.writeTextFile(saveFilePath, history.join("\n"));
        console.log(`History saved to ${saveFilePath}`);
      } catch (error) {
        console.error(`Error saving history: ${error instanceof Error ? error.message : String(error)}`);
      }
      break;
    }
      
    case ":colors":
      setColors(!useColors);
      console.log(`Colorized output ${useColors ? "enabled" : "disabled"}`);
      break;
      
    case ":clear":
      console.clear();
      break;
      
    case ":reset":
      try {
        // Reset REPL state by reinitializing evaluator
        console.log("Resetting REPL environment...");
        if (typeof evaluator.resetEnvironment === 'function') {
          evaluator.resetEnvironment();
          console.log("Environment reset complete.");
        } else {
          console.log("Environment reset not supported.");
        }
      } catch (error) {
        console.error(`Error resetting environment: ${error instanceof Error ? error.message : String(error)}`);
      }
      break;
      
    default:
      console.error(`Unknown command: ${cmd}`);
      console.log("Type :help for a list of commands");
  }
}

/**
 * Read a line with arrow key history navigation support
 */
async function readLineWithHistory(
  prompt: string, 
  history: string[]
): Promise<string> {
  const encoder = new TextEncoder();
  
  // Write prompt
  await Deno.stdout.write(encoder.encode(prompt));
  
  let currentInput = "";
  let cursorPos = 0;
  let historyIndex = history.length;
  
  // Function to redraw the current line
  const redrawLine = async () => {
    // First move to the beginning of the line
    await Deno.stdout.write(encoder.encode("\r"));
    
    // Then clear the entire line (but don't go to next line)
    await Deno.stdout.write(encoder.encode("\x1b[K"));
    
    // Write prompt and current input
    await Deno.stdout.write(encoder.encode(prompt + currentInput));
    
    // Position cursor correctly if not at the end
    if (cursorPos < currentInput.length) {
      // Move cursor to the correct position (from end to desired position)
      const moveLeft = currentInput.length - cursorPos;
      await Deno.stdout.write(encoder.encode(`\x1b[${moveLeft}D`));
    }
  };

  // Helper to delete a word backwards
  const deleteWord = async () => {
    if (cursorPos > 0) {
      // Find the start of the current word
      let newPos = cursorPos - 1;
      // Skip any whitespace immediately before the cursor
      while (newPos > 0 && /\s/.test(currentInput[newPos])) {
        newPos--;
      }
      // Skip back to the start of the word
      while (newPos > 0 && !/\s/.test(currentInput[newPos - 1])) {
        newPos--;
      }
      
      // Remove the word
      currentInput = currentInput.slice(0, newPos) + currentInput.slice(cursorPos);
      cursorPos = newPos;
      await redrawLine();
    }
  };
  
  while (true) {
    const keypressEvent = await keypress();
    
    // Handle different key presses based on the keypress event structure
    if (keypressEvent && keypressEvent.ctrlKey && keypressEvent.key === "c") {
      // Ctrl+C - exit REPL
      await Deno.stdout.write(encoder.encode("\nExiting REPL...\n"));
      // Exit Deno process
      Deno.exit(0);
    } else if (keypressEvent && keypressEvent.key === "return") {
      // Enter - complete input
      await Deno.stdout.write(encoder.encode("\n"));
      if (currentInput.trim() && (history.length === 0 || history[history.length - 1] !== currentInput)) {
        history.push(currentInput);
      }
      return currentInput;
    } else if (keypressEvent && keypressEvent.key === "backspace") {
      // Backspace - delete character before cursor
      if (cursorPos > 0) {
        currentInput = currentInput.slice(0, cursorPos - 1) + currentInput.slice(cursorPos);
        cursorPos--;
        await redrawLine();
      }
    } else if (keypressEvent && keypressEvent.key === "delete") {
      // Delete - remove character at cursor
      if (cursorPos < currentInput.length) {
        currentInput = currentInput.slice(0, cursorPos) + currentInput.slice(cursorPos + 1);
        await redrawLine();
      }
    } else if (keypressEvent && keypressEvent.key === "left") {
      // Left arrow - move cursor left
      if (cursorPos > 0) {
        cursorPos--;
        await redrawLine();
      }
    } else if (keypressEvent && keypressEvent.key === "right") {
      // Right arrow - move cursor right
      if (cursorPos < currentInput.length) {
        cursorPos++;
        await redrawLine();
      }
    } else if (keypressEvent && keypressEvent.key === "up") {
      // Up arrow - navigate history backwards
      if (historyIndex > 0) {
        historyIndex--;
        currentInput = history[historyIndex];
        cursorPos = currentInput.length;
        await redrawLine();
      }
    } else if (keypressEvent && keypressEvent.key === "down") {
      // Down arrow - navigate history forwards
      if (historyIndex < history.length - 1) {
        historyIndex++;
        currentInput = history[historyIndex];
        cursorPos = currentInput.length;
        await redrawLine();
      } else if (historyIndex === history.length - 1) {
        // At the end of history, show empty line
        historyIndex = history.length;
        currentInput = "";
        cursorPos = 0;
        await redrawLine();
      }
    } else if (keypressEvent && keypressEvent.key === "tab") {
      // Tab - simple autocompletion (can be expanded later)
      // For now, just add two spaces
      currentInput = currentInput.slice(0, cursorPos) + "  " + currentInput.slice(cursorPos);
      cursorPos += 2;
      await redrawLine();
    } else if (keypressEvent && keypressEvent.key === "home") {
      // Home - move cursor to start
      cursorPos = 0;
      await redrawLine();
    } else if (keypressEvent && keypressEvent.key === "end") {
      // End - move cursor to end
      cursorPos = currentInput.length;
      await redrawLine();
    } 
    // 1. CTRL+W: Delete word before cursor
    else if (keypressEvent && keypressEvent.ctrlKey && keypressEvent.key === "w") {
      await deleteWord();
    } 
    // 2. CTRL+E: Move to end of line (rightmost)
    else if (keypressEvent && keypressEvent.ctrlKey && keypressEvent.key === "e") {
      cursorPos = currentInput.length;
      await redrawLine();
    } 
    // 3. CTRL+A or CMD+A: Move to beginning of line (leftmost)
    else if ((keypressEvent && keypressEvent.ctrlKey && keypressEvent.key === "a") || 
             (keypressEvent && keypressEvent.metaKey && keypressEvent.key === "a")) {
      cursorPos = 0;
      await redrawLine();
    }
    // 4. CTRL+K: Kill line (delete from cursor to end of line)
    else if (keypressEvent && keypressEvent.ctrlKey && keypressEvent.key === "k") {
      currentInput = currentInput.slice(0, cursorPos);
      await redrawLine();
    }
    // 5. CTRL+U: Delete from cursor to beginning of line
    else if (keypressEvent && keypressEvent.ctrlKey && keypressEvent.key === "u") {
      currentInput = currentInput.slice(cursorPos);
      cursorPos = 0;
      await redrawLine();
    }
    // 6. CTRL+L: Clear screen but keep the current line
    else if (keypressEvent && keypressEvent.ctrlKey && keypressEvent.key === "l") {
      // Clear screen
      await Deno.stdout.write(encoder.encode("\x1b[2J\x1b[H"));
      await redrawLine();
    }
    // 7. ALT+B or CTRL+Left: Move backward one word
    else if ((keypressEvent && keypressEvent.altKey && keypressEvent.key === "b") ||
             (keypressEvent && keypressEvent.ctrlKey && keypressEvent.key === "left")) {
      if (cursorPos > 0) {
        let newPos = cursorPos - 1;
        // Skip any whitespace immediately before the cursor
        while (newPos > 0 && /\s/.test(currentInput[newPos])) {
          newPos--;
        }
        // Skip back to the start of the word
        while (newPos > 0 && !/\s/.test(currentInput[newPos - 1])) {
          newPos--;
        }
        cursorPos = newPos;
        await redrawLine();
      }
    }
    // 8. ALT+F or CTRL+Right: Move forward one word
    else if ((keypressEvent && keypressEvent.altKey && keypressEvent.key === "f") ||
             (keypressEvent && keypressEvent.ctrlKey && keypressEvent.key === "right")) {
      if (cursorPos < currentInput.length) {
        let newPos = cursorPos;
        // Skip the rest of the current word
        while (newPos < currentInput.length && !/\s/.test(currentInput[newPos])) {
          newPos++;
        }
        // Skip any whitespace after the word
        while (newPos < currentInput.length && /\s/.test(currentInput[newPos])) {
          newPos++;
        }
        cursorPos = newPos;
        await redrawLine();
      }
    }
    // 9. CTRL+D: Delete character at cursor (like Delete key) or exit if line is empty
    else if (keypressEvent && keypressEvent.ctrlKey && keypressEvent.key === "d") {
      if (currentInput.length === 0) {
        // Exit REPL if line is empty
        await Deno.stdout.write(encoder.encode("\nExiting REPL...\n"));
        Deno.exit(0);
      } else if (cursorPos < currentInput.length) {
        // Delete character at cursor
        currentInput = currentInput.slice(0, cursorPos) + currentInput.slice(cursorPos + 1);
        await redrawLine();
      }
    }
    // 10. CTRL+T: Transpose characters (swap character before cursor with character at cursor)
    else if (keypressEvent && keypressEvent.ctrlKey && keypressEvent.key === "t") {
      if (cursorPos > 0 && cursorPos < currentInput.length) {
        const beforeChar = currentInput[cursorPos - 1];
        const atCursorChar = currentInput[cursorPos];
        currentInput = currentInput.slice(0, cursorPos - 1) + 
                        atCursorChar + beforeChar + 
                        currentInput.slice(cursorPos + 1);
        await redrawLine();
      }
    }
    else if (keypressEvent && keypressEvent.sequence && !keypressEvent.ctrlKey && !keypressEvent.metaKey && !keypressEvent.altKey) {
      // Regular character input
      currentInput = currentInput.slice(0, cursorPos) + keypressEvent.sequence + currentInput.slice(cursorPos);
      cursorPos += keypressEvent.sequence.length;
      await redrawLine();
    }
  }
}

// Only start the REPL if this module is the main module
if (import.meta.main) {
  startRepl();
}