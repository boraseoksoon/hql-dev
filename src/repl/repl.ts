// src/repl/enhanced-repl.ts - Comprehensive REPL with dynamic import support

import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { keypress } from "https://deno.land/x/cliffy@v1.0.0-rc.3/keypress/mod.ts";
import { readLines } from "https://deno.land/std@0.224.0/io/read_lines.ts";
import { Logger } from "../logger.ts";
import { Environment } from "../environment.ts";
import { REPLEvaluator } from "./repl-evaluator.ts";
import { loadSystemMacros } from "../transpiler/hql-transpiler.ts";
import { formatError, getSuggestion, registerSourceFile } from "../transpiler/error/error-handling.ts";
import { ImportError, TranspilerError } from "../transpiler/error/errors.ts";
import { historyManager } from "./history-manager.ts";
import * as termColors from "../utils/colors.ts";

// Collection of special symbols for autocomplete
const SPECIAL_SYMBOLS = new Set([
  "if", "when", "unless", "fn", "defn", "lambda", "let", "do", "cond", "case", 
  "while", "for", "import", "export", "loop", "recur", "try", "catch",
  "true", "false", "nil", "null", "undefined", "console.log", "print"
]);

interface ReplOptions {
  verbose?: boolean;
  baseDir?: string;
  historySize?: number;
  showAst?: boolean;
  showExpanded?: boolean;
  showJs?: boolean;
  initialFile?: string;
  useColors?: boolean;
  enableCompletion?: boolean;  // New option for symbol completion
}

/* ─────────────────────────────────────────────────────────────────────────────
   Color and Output Utilities
───────────────────────────────────────────────────────────────────────────── */
// Terminal color utilities
const colors = {
  reset: termColors.reset,
  bright: termColors.bright,
  dim: termColors.dim,
  underscore: termColors.underscore,
  blink: termColors.blink,
  reverse: termColors.reverse,
  hidden: termColors.hidden,
  fg: termColors.fg,
  bg: termColors.bg
};

function printBlock(header: string, content: string, useColors = false): void {
  const headerText = useColors
    ? `${colors.fg.sicpRed}${colors.bright}${header}${colors.reset}`
    : header;
  console.log(headerText);
  console.log(content, "\n");
}

function colorText(text: string, colorCode: string, useColors = true): string {
  return useColors ? `${colorCode}${text}${colors.reset}` : text;
}

function printBanner(useColors = false): void {
  const headerColor = useColors ? colors.fg.sicpPurple + colors.bright : "";
  const textColor = useColors ? colors.fg.white : "";
  const commandColor = useColors ? colors.fg.sicpRed : "";
  const reset = useColors ? colors.reset : "";
  const banner = [
    `${headerColor}╔════════════════════════════════════════════════════════════╗${reset}`,
    `${headerColor}║                ${textColor}HQL S-Expression REPL${headerColor}                        ║${reset}`,
    `${headerColor}╠════════════════════════════════════════════════════════════╣${reset}`,
    `${headerColor}║  ${textColor}Type HQL expressions to evaluate them${headerColor}                      ║${reset}`,
    `${headerColor}║  ${textColor}Special commands:${headerColor}                                          ║${reset}`,
    `${headerColor}║    ${commandColor}:help${textColor} - Display this help${headerColor}                                ║${reset}`,
    `${headerColor}║    ${commandColor}:quit${textColor}, ${commandColor}:exit${textColor} - Exit the REPL${headerColor}                             ║${reset}`,
    `${headerColor}║    ${commandColor}:env${textColor} - Show environment bindings${headerColor}                         ║${reset}`,
    `${headerColor}║    ${commandColor}:macros${textColor} - Show defined macros${headerColor}                            ║${reset}`,
    `${headerColor}║    ${commandColor}:modules${textColor} - List imported modules${headerColor}                         ║${reset}`,
    `${headerColor}║    ${commandColor}:js${textColor} - Toggle JavaScript output display${headerColor}                   ║${reset}`,
    `${headerColor}║    ${commandColor}:reset${textColor} - Reset REPL environment${headerColor}                          ║${reset}`,
    `${headerColor}╚════════════════════════════════════════════════════════════╝${reset}`
  ];
  banner.forEach(line => console.log(line));
}

function printError(msg: string, useColors: boolean): void {
  console.error(useColors ? `${colors.fg.red}${msg}${colors.reset}` : msg);
}

function getPrompt(multilineMode: boolean, useColors: boolean): string {
  if (useColors) {
    return multilineMode
      ? `${colors.fg.sicpPurple}${colors.bright}... ${colors.reset}`
      : `${colors.fg.sicpPurple}${colors.bright}hql> ${colors.reset}`;
  }
  return multilineMode ? "... " : "hql> ";
}

/* ─────────────────────────────────────────────────────────────────────────────
   REPL State Helpers
───────────────────────────────────────────────────────────────────────────── */
interface ReplState {
  multilineMode: boolean;
  multilineInput: string;
  parenBalance: number;
  importHandlerActive: boolean;
}

function resetReplState(state: ReplState): void {
  state.multilineMode = false;
  state.multilineInput = "";
  state.parenBalance = 0;
}

function updateParenBalance(line: string, currentBalance: number): number {
  let balance = currentBalance;
  let inString = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    // Handle string literals to avoid counting parens inside them
    if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === "(") balance++;
      else if (char === ")") balance--;
    }
  }
  return balance;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Command Handlers
   (Each command is now a separate function)
───────────────────────────────────────────────────────────────────────────── */
function commandHelp(useColors: boolean): void {
  printBanner(useColors);
}

function commandQuit(setRunning: (val: boolean) => void): void {
  setRunning(false);
}

function commandEnv(evaluator: REPLEvaluator, useColors: boolean, logger: Logger): void {
  const env = evaluator.getEnvironment();
  console.log(colorText("Environment bindings:", colors.fg.sicpRed + colors.bright, useColors));
  
  // Get all defined symbols
  const symbols = env.getAllDefinedSymbols();
  
  if (symbols.length === 0) {
    console.log("No symbols defined");
  } else {
    console.log("Defined symbols:");
    console.log("----------------");
    symbols.forEach(symbol => {
      try {
        const value = env.lookup(symbol);
        const valueStr = formatValue(value);
        console.log(`${symbol} = ${valueStr}`);
      } catch (error) {
        console.log(`${symbol} = <error: ${error.message}>`);
      }
    });
    console.log("----------------");
  }
}

function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  
  if (typeof value === 'function') {
    return value.toString().includes("native code")
      ? "[Native Function]"
      : "[Function]";
  }
  
  if (typeof value === 'object') {
    try {
      if (Array.isArray(value)) {
        if (value.length > 5) {
          return `[Array(${value.length}): ${JSON.stringify(value.slice(0, 5))}...]`;
        }
        return JSON.stringify(value);
      }
      
      const stringified = JSON.stringify(value, null, 2);
      if (stringified.length > 100) {
        return stringified.substring(0, 100) + "...";
      }
      return stringified;
    } catch (e) {
      return "[Object]";
    }
  }
  
  return String(value);
}

function commandMacros(evaluator: REPLEvaluator, useColors: boolean): void {
  console.log(colorText("Defined macros:", colors.fg.sicpRed + colors.bright, useColors));
  const environment = evaluator.getEnvironment();
  console.log("Macro names:");
  console.log("------------");
  if (environment && "macros" in environment && environment.macros instanceof Map) {
    const macroKeys = Array.from(environment.macros.keys());
    if (macroKeys.length > 0) {
      macroKeys.sort().forEach(macroName => {
        console.log(`- ${macroName}`);
      });
    } else {
      console.log("No macros defined");
    }
  } else {
    console.log("Macro information not available");
  }
  console.log("------------");
}

function commandModules(evaluator: REPLEvaluator, useColors: boolean): void {
  console.log(colorText("Imported Modules:", colors.fg.sicpRed + colors.bright, useColors));
  
  const modules = evaluator.getImportedModules();
  if (modules.size === 0) {
    console.log("No modules imported");
  } else {
    console.log("Module names:");
    console.log("------------");
    for (const [moduleName, modulePath] of modules.entries()) {
      console.log(`- ${moduleName} from "${modulePath}"`);
    }
    console.log("------------");
  }
}

function commandVerbose(logger: Logger, setVerbose: (val: boolean) => void): void {
  setVerbose(!logger.isVerbose);
  console.log(`Verbose mode ${logger.isVerbose ? "enabled" : "disabled"}`);
}

function commandAst(showAst: boolean, setShowAst: (val: boolean) => void): void {
  setShowAst(!showAst);
  console.log(`AST display ${showAst ? "enabled" : "disabled"}`);
}

function commandExpanded(showExpanded: boolean, setShowExpanded: (val: boolean) => void): void {
  setShowExpanded(!showExpanded);
  console.log(`Expanded form display ${showExpanded ? "enabled" : "disabled"}`);
}

function commandJs(showJs: boolean, setShowJs: (val: boolean) => void): void {
  setShowJs(!showJs);
  console.log(`JavaScript output display ${showJs ? "enabled" : "disabled"}`);
}

function commandReset(evaluator: REPLEvaluator): void {
  console.log("Resetting REPL environment...");
  evaluator.resetEnvironment();
  console.log("Environment reset complete.");
}

function commandDefault(cmd: string): void {
  console.error(`Unknown command: ${cmd}`);
  console.log("Type :help for a list of commands");
}

/* ─────────────────────────────────────────────────────────────────────────────
   REPL Input Handling Helpers
───────────────────────────────────────────────────────────────────────────── */
// We now return an object indicating if the input was obtained via history navigation.
interface ReadLineResult {
  text: string;
  fromHistory: boolean;
  controlD: boolean;
}

async function readLineWithHistory(
  prompt: string, 
  history: string[], 
  state: ReplState
): Promise<ReadLineResult> {
  const encoder = new TextEncoder();
  await Deno.stdout.write(encoder.encode(prompt));
  let currentInput = "", cursorPos = 0, historyIndex = history.length;
  let historyNavigated = false;

  const redrawLine = async () => {
    await Deno.stdout.write(encoder.encode("\r\x1b[K" + prompt + currentInput));
    if (cursorPos < currentInput.length) {
      await Deno.stdout.write(encoder.encode(`\x1b[${currentInput.length - cursorPos}D`));
    }
  };

  const deleteWord = async () => {
    if (cursorPos > 0) {
      let newPos = cursorPos - 1;
      while (newPos > 0 && /\s/.test(currentInput[newPos])) newPos--;
      while (newPos > 0 && !/\s/.test(currentInput[newPos - 1])) newPos--;
      currentInput = currentInput.slice(0, newPos) + currentInput.slice(cursorPos);
      cursorPos = newPos;
      await redrawLine();
    }
  };

  while (true) {
    const key = await keypress();

    if (key?.ctrlKey && key.key === "c") {
      await Deno.stdout.write(encoder.encode("\nExiting REPL...\n"));
      Deno.exit(0);
    } else if (key?.ctrlKey && key.key === "d") {
      // Special handling for Ctrl+D (EOF)
      if (currentInput.length === 0) {
        await Deno.stdout.write(encoder.encode("\n"));
        return { text: "", fromHistory: false, controlD: true };
      }
    } else if (key?.key === "return") {
      await Deno.stdout.write(encoder.encode("\n"));
      if (currentInput.trim() && (history.length === 0 || history[history.length - 1] !== currentInput)) {
        history.push(currentInput);
      }
      return { text: currentInput, fromHistory: historyNavigated, controlD: false };
    } else if (key?.key === "backspace") {
      if (cursorPos > 0) {
        currentInput = currentInput.slice(0, cursorPos - 1) + currentInput.slice(cursorPos);
        cursorPos--;
        await redrawLine();
      }
    } else if (key?.key === "delete") {
      if (cursorPos < currentInput.length) {
        currentInput = currentInput.slice(0, cursorPos) + currentInput.slice(cursorPos + 1);
        await redrawLine();
      }
    } else if (key?.key === "left") {
      if (cursorPos > 0) { cursorPos--; await redrawLine(); }
    } else if (key?.key === "right") {
      if (cursorPos < currentInput.length) { cursorPos++; await redrawLine(); }
    } else if (key?.key === "up") {
      if (historyIndex > 0) {
        historyIndex--;
        currentInput = history[historyIndex];
        cursorPos = currentInput.length;
        historyNavigated = true;
        await redrawLine();
      }
    } else if (key?.key === "down") {
      if (historyIndex < history.length - 1) {
        historyIndex++;
        currentInput = history[historyIndex];
        cursorPos = currentInput.length;
        historyNavigated = true;
        await redrawLine();
      } else if (historyIndex === history.length - 1) {
        historyIndex = history.length;
        currentInput = "";
        cursorPos = 0;
        historyNavigated = true;
        await redrawLine();
      }
    } else if (key?.key === "tab") {
      currentInput = currentInput.slice(0, cursorPos) + "  " + currentInput.slice(cursorPos);
      cursorPos += 2;
      await redrawLine();
    } else if (key?.key === "home") {
      cursorPos = 0;
      await redrawLine();
    } else if (key?.key === "end") {
      cursorPos = currentInput.length;
      await redrawLine();
    } else if (key?.ctrlKey && key.key === "w") {
      await deleteWord();
    } else if (key?.ctrlKey && key.key === "e") {
      cursorPos = currentInput.length;
      await redrawLine();
    } else if ((key?.ctrlKey && key.key === "a") || (key?.metaKey && key.key === "a")) {
      cursorPos = 0;
      await redrawLine();
    } else if (key?.ctrlKey && key.key === "k") {
      currentInput = currentInput.slice(0, cursorPos);
      await redrawLine();
    } else if (key?.ctrlKey && key.key === "u") {
      currentInput = currentInput.slice(cursorPos);
      cursorPos = 0;
      await redrawLine();
    } else if (key?.ctrlKey && key.key === "l") {
      await Deno.stdout.write(encoder.encode("\x1b[2J\x1b[H"));
      await redrawLine();
    } else if ((key?.altKey && key.key === "b") || (key?.ctrlKey && key.key === "left")) {
      if (cursorPos > 0) {
        let newPos = cursorPos - 1;
        while (newPos > 0 && /\s/.test(currentInput[newPos])) newPos--;
        while (newPos > 0 && !/\s/.test(currentInput[newPos - 1])) newPos--;
        cursorPos = newPos;
        await redrawLine();
      }
    } else if ((key?.altKey && key.key === "f") || (key?.ctrlKey && key.key === "right")) {
      if (cursorPos < currentInput.length) {
        let newPos = cursorPos;
        while (newPos < currentInput.length && !/\s/.test(currentInput[newPos])) newPos++;
        while (newPos < currentInput.length && /\s/.test(currentInput[newPos])) newPos++;
        cursorPos = newPos;
        await redrawLine();
      }
    } else if (key?.sequence) {
      // Accept sequences of any length - this handles pasted text naturally
      currentInput = currentInput.slice(0, cursorPos) + key.sequence + currentInput.slice(cursorPos);
      cursorPos += key.sequence.length;
      await redrawLine();
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   REPL Input Processing
   This helper decides whether the input is a command, a multiline continuation,
   or a complete expression ready for evaluation.
───────────────────────────────────────────────────────────────────────────── */
interface ProcessOptions {
  logger: Logger;
  baseDir: string;
  historySize: number;
  showAst: boolean;
  showExpanded: boolean;
  showJs: boolean;
  useColors: boolean;
  trackSymbolUsage?: (symbol: string) => void;
  replState: {
    setRunning: (val: boolean) => void;
    setVerbose: (val: boolean) => void;
    setColors: (val: boolean) => void;
    setShowAst: (val: boolean) => void;
    setShowExpanded: (val: boolean) => void;
    setShowJs: (val: boolean) => void;
  };
}

async function handleReplLine(
  lineResult: ReadLineResult,
  state: ReplState,
  evaluator: REPLEvaluator,
  history: string[],
  options: ProcessOptions
): Promise<void> {
  // Process the input text
  state.parenBalance = updateParenBalance(lineResult.text, state.parenBalance);

  if (state.multilineMode) {
    // If coming from history navigation, do not add an extra newline.
    state.multilineInput += lineResult.fromHistory ? lineResult.text : lineResult.text + "\n";
    if (state.parenBalance <= 0) {
      state.multilineMode = false;
      await processInput(state.multilineInput, evaluator, history, options, state);
      resetReplState(state);
    }
  } else if (lineResult.text.startsWith(":")) {
    await handleCommand(lineResult.text, state, evaluator, history, options);
  } else if (state.parenBalance > 0) {
    state.multilineMode = true;
    state.multilineInput = lineResult.text + "\n";
  } else {
    await processInput(lineResult.text, evaluator, history, options, state);
  }
}

async function processInput(
  input: string,
  evaluator: REPLEvaluator,
  history: string[],
  options: ProcessOptions,
  state: ReplState
): Promise<void> {
  const trimmed = input.trim();
  if (trimmed && (history.length === 0 || history[history.length - 1] !== trimmed)) {
    history.push(trimmed);
    if (history.length > options.historySize) history.shift();
  }
  
  // Register the input for better error reporting
  registerSourceFile("REPL input", input);
  
  // Special handling for imports
  if (isImportExpression(trimmed)) {
    const result = await evaluator.processImportDirectly(trimmed);
    
    if (result.success) {
      console.log(options.useColors
        ? `${colors.fg.green}${result.message}${colors.reset}`
        : result.message);
    } else {
      console.error(options.useColors
        ? `${colors.fg.red}${result.message}${colors.reset}`
        : result.message);
    }
    
    state.importHandlerActive = true;
    return;
  }
  
  try {
    // Add timestamp for performance tracking
    const startTime = performance.now();
    
    // Evaluate the input
    const result = await evaluator.evaluate(input, {
      verbose: options.logger.enabled,
      baseDir: options.baseDir,
      showAst: options.showAst,
      showExpanded: options.showExpanded,
      showJs: options.showJs,
    });
    
    // Calculate execution time
    const executionTime = performance.now() - startTime;
    
    // Format and display the result
    formatAndDisplayResult(result, input, options, executionTime);
    
    // Additional output for debug modes
    if (options.showJs) {
      printBlock("JavaScript:", result.jsCode, options.useColors);
    }
    
    // Track symbols used
    if (options.trackSymbolUsage) {
      trackSymbolsInInput(input, options.trackSymbolUsage);
    }
  } catch (error: unknown) {
    // Reset import handler flag
    state.importHandlerActive = false;
    
    // Enhanced error handling
    handleError(error, options);
    
    // Reset state
    resetReplState(state);
  }
}

// Helper function to format and display result
function formatAndDisplayResult(result: any, input: string, options: ProcessOptions, executionTime: number): void {
  if (result.value !== undefined) {
    // Format the result value based on its type
    let displayValue = formatResultValue(result.value, options.useColors);
    console.log(displayValue);
  } else if (input.trim().startsWith("(fn ") || input.trim().startsWith("(defn ")) {
    // Handle function definitions
    const match = input.trim().match(/\((?:fn|defn)\s+([a-zA-Z0-9_-]+)/);
    const functionName = match ? match[1] : "anonymous";
    console.log(options.useColors
      ? `${colors.fg.lightGreen}Function ${functionName} defined${colors.reset}`
      : `Function ${functionName} defined`);
  } else if (input.trim().startsWith("(def ")) {
    // Handle variable definitions
    const match = input.trim().match(/\(def\s+([a-zA-Z0-9_-]+)/);
    const varName = match ? match[1] : "value";
    console.log(options.useColors
      ? `${colors.fg.lightGreen}Variable ${varName} defined${colors.reset}`
      : `Variable ${varName} defined`);
  } else {
    // Handle undefined results
    console.log(options.useColors
      ? `${colors.fg.lightBlue}undefined${colors.reset}`
      : "undefined");
  }
  
  // Show execution time if verbose
  if (options.logger.enabled) {
    console.log(options.useColors
      ? `${colors.fg.gray}// Execution time: ${executionTime.toFixed(2)}ms${colors.reset}`
      : `// Execution time: ${executionTime.toFixed(2)}ms`);
  }
}

// Helper to format result values with proper coloring
function formatResultValue(value: any, useColors: boolean): string {
  if (value === null) {
    return useColors ? `${colors.fg.lightBlue}null${colors.reset}` : "null";
  }
  
  if (value === undefined) {
    return useColors ? `${colors.fg.lightBlue}undefined${colors.reset}` : "undefined";
  }
  
  if (typeof value === "number") {
    return useColors ? `${colors.fg.lightGreen}${value}${colors.reset}` : String(value);
  }
  
  if (typeof value === "string") {
    return useColors ? `${colors.fg.lightYellow}"${value}"${colors.reset}` : `"${value}"`;
  }
  
  if (typeof value === "boolean") {
    return useColors ? `${colors.fg.lightPurple}${value}${colors.reset}` : String(value);
  }
  
  if (typeof value === "function") {
    return useColors 
      ? `${colors.fg.lightCyan}[Function${value.name ? ': ' + value.name : ''}]${colors.reset}`
      : `[Function${value.name ? ': ' + value.name : ''}]`;
  }
  
  if (typeof value === "object") {
    try {
      if (Array.isArray(value)) {
        // Format arrays more nicely
        const json = JSON.stringify(value, null, 2);
        return useColors ? `${colors.fg.lightCyan}${json}${colors.reset}` : json;
      }
      
      // Format objects
      const json = JSON.stringify(value, null, 2);
      return useColors ? `${colors.fg.lightCyan}${json}${colors.reset}` : json;
    } catch {
      return useColors ? `${colors.fg.lightCyan}[Object]${colors.reset}` : "[Object]";
    }
  }
  
  return String(value);
}

// Track symbols used in input
function trackSymbolsInInput(input: string, tracker: (symbol: string) => void): void {
  const symbolRegex = /\b[a-zA-Z0-9_-]+\b/g;
  let match;
  while ((match = symbolRegex.exec(input)) !== null) {
    tracker(match[0]);
  }
}

// Enhanced error handling
function handleError(error: unknown, options: ProcessOptions): void {
  if (error instanceof Error) {
    // Format error with source context
    const formattedError = formatError(error, { 
      useColors: options.useColors, 
      filePath: "REPL input",
      includeStack: options.logger.enabled, // Include stack trace in verbose mode
    });
    
    // Display the detailed error
    console.error(formattedError);
    
    // Show helpful suggestion
    const suggestion = getSuggestion(error);
    if (suggestion) {
      console.error(options.useColors
        ? `${colors.fg.cyan}Suggestion: ${suggestion}${colors.reset}`
        : `Suggestion: ${suggestion}`);
    }
  } else {
    // Fallback for non-Error objects
    console.error(options.useColors
      ? `${colors.fg.red}Error: ${String(error)}${colors.reset}`
      : `Error: ${String(error)}`);
  }
}

/**
 * Check if an input string looks like an import statement
 */
function isImportExpression(input: string): boolean {
  input = input.trim();
  
  // Check for HQL import syntax: (import name from "path")
  if (input.startsWith('(import ') && input.includes(' from ') && input.endsWith(')')) {
    return true;
  }
  
  // Check for vector import syntax: (import [a b c] from "path")
  if (input.startsWith('(import [') && input.includes('] from "') && input.endsWith(')')) {
    return true;
  }
  
  // Check for simple import: (import "path")
  if (input.startsWith('(import "') && input.endsWith('")')) {
    return true;
  }
  
  return false;
}

/**
 * Handle an import expression by using the DynamicImportHandler
 */
// This function is no longer needed as we're using evaluator.processImportDirectly

/* ─────────────────────────────────────────────────────────────────────────────
   Command Handling Dispatcher
───────────────────────────────────────────────────────────────────────────── */
async function handleCommand(
  command: string,
  state: ReplState,
  evaluator: REPLEvaluator,
  history: string[],
  options: ProcessOptions
): Promise<void> {
  const parts = command.split(" ");
  const cmd = parts[0];
  switch (cmd) {
    case ":help":
    case ":h":
      commandHelp(options.useColors);
      break;
    case ":quit":
    case ":exit":
    case ":q":
      commandQuit(options.replState.setRunning);
      break;
    case ":env":
      commandEnv(evaluator, options.useColors, options.logger);
      break;
    case ":macros":
      commandMacros(evaluator, options.useColors);
      break;
    case ":modules":
      commandModules(evaluator, options.useColors);
      break;
    case ":js":
      commandJs(options.showJs, options.replState.setShowJs);
      break;
    case ":reset":
      commandReset(evaluator);
      break;
    default:
      commandDefault(cmd);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main REPL Loop
───────────────────────────────────────────────────────────────────────────── */
export async function startRepl(options: ReplOptions = {}): Promise<void> {
  const logger = new Logger(options.verbose ?? false);
  const baseDir = options.baseDir ?? Deno.cwd();
  const historySize = options.historySize ?? 100;
  const { 
    showAst = false, 
    showExpanded = false, 
    showJs = false, 
    useColors = true,
  } = options;

  let running = true;
  const history: string[] = historyManager.load(historySize);
  const replStateObj: ReplState = { 
    multilineMode: false, 
    multilineInput: "", 
    parenBalance: 0,
    importHandlerActive: false
  };

  const stateFunctions = {
    setRunning: (val: boolean) => { running = val; },
    setVerbose: logger.setEnabled.bind(logger),
    setColors: (val: boolean) => { /* update local flag if needed */ },
    setShowAst: (val: boolean) => { /* update local flag if needed */ },
    setShowExpanded: (val: boolean) => { /* update local flag if needed */ },
    setShowJs: (val: boolean) => { /* update local flag if needed */ },
  };

  const trackSymbolUsage = (symbol: string) => logger.debug(`Symbol used: ${symbol}`);

  printBanner(useColors);
  logger.log({ text: "Initializing environment...", namespace: "repl" });

  try {
    // Initialize environment
    const env = await Environment.initializeGlobalEnv({ verbose: options.verbose });
    await loadSystemMacros(env, { verbose: options.verbose, baseDir: Deno.cwd() });
    
    // Create new evaluator
    const evaluator = new REPLEvaluator(env, {
      verbose: options.verbose,
      baseDir,
      showAst,
      showExpanded,
      showJs,
    });
    
    // Log available macros in verbose mode
    if (options.verbose) {
      logger.log({ 
        text: `Available macros: ${[...env.macros.keys()].join(", ")}`, 
        namespace: "repl" 
      });
    }

    // Start REPL loop
    while (running) {
      try {
        const prompt = getPrompt(replStateObj.multilineMode, useColors);
        const lineResult = await readLineWithHistory(prompt, history, replStateObj);
        
        // Save history after each command
        historyManager.save(history.slice(-historySize));
        
        if (!lineResult.text.trim() && !lineResult.controlD) continue;
        
        await handleReplLine(lineResult, replStateObj, evaluator, history, {
          logger,
          baseDir,
          historySize,
          showAst,
          showExpanded,
          showJs,
          useColors,
          trackSymbolUsage,
          replState: stateFunctions,
        });
      } catch (error) {
        printError(
          error instanceof Error ? error.message : String(error),
          useColors
        );
      }
    }
  } catch (error) {
    console.error(
      `REPL initialization error: ${error instanceof Error ? error.message : String(error)}`
    );
    Deno.exit(1);
  }
}