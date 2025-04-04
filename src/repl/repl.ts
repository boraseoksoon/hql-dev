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
import { ImportError, TransformError } from "../transpiler/error/errors.ts";
import { processImports } from "../imports.ts"; 
import { parse } from "../transpiler/pipeline/parser.ts";
import { historyManager } from "./history-manager.ts";
import { clipboardHandler } from "./clipboard-handler.ts";

interface ReplOptions {
  verbose?: boolean;
  baseDir?: string;
  historySize?: number;
  showAst?: boolean;
  showExpanded?: boolean;
  showJs?: boolean;
  initialFile?: string;
  useColors?: boolean;
  pasteMode?: boolean;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Color and Output Utilities
───────────────────────────────────────────────────────────────────────────── */
export const colors = {
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
    sicpRed: "\x1b[38;2;220;50;47m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    crimson: "\x1b[38m",
    sicpPurple: "\x1b[38;2;128;0;128m",
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
    sicpRed: "\x1b[48;2;220;50;47m",
    sicpPurple: "\x1b[48;2;128;0;128m"
  }
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
    `${headerColor}║    ${commandColor}:verbose${textColor} - Toggle verbose mode${headerColor}                           ║${reset}`,
    `${headerColor}║    ${commandColor}:ast${textColor} - Toggle AST display${headerColor}                                ║${reset}`,
    `${headerColor}║    ${commandColor}:expanded${textColor} - Toggle expanded form display${headerColor}                 ║${reset}`,
    `${headerColor}║    ${commandColor}:js${textColor} - Toggle JavaScript output display${headerColor}                   ║${reset}`,
    `${headerColor}║    ${commandColor}:load${textColor} <filename> - Load and evaluate a file${headerColor}              ║${reset}`,
    `${headerColor}║    ${commandColor}:save${textColor} <filename> - Save history to a file${headerColor}                ║${reset}`,
    `${headerColor}║    ${commandColor}:colors${textColor} - Toggle colorized output${headerColor}                        ║${reset}`,
    `${headerColor}║    ${commandColor}:clear${textColor} - Clear the screen${headerColor}                                ║${reset}`,
    `${headerColor}║    ${commandColor}:paste${textColor} - Enter paste mode for multi-line input${headerColor}           ║${reset}`,
    `${headerColor}║    ${commandColor}:modules${textColor} - List imported modules${headerColor}                         ║${reset}`,
    `${headerColor}╚════════════════════════════════════════════════════════════╝${reset}`
  ];
  banner.forEach(line => console.log(line));
}

function printError(msg: string, useColors: boolean): void {
  console.error(useColors ? `${colors.fg.red}${msg}${colors.reset}` : msg);
}

function getPrompt(multilineMode: boolean, pasteMode: boolean, useColors: boolean): string {
  if (pasteMode) {
    return useColors 
      ? `${colors.fg.yellow}paste> ${colors.reset}`
      : "paste> ";
  }
  
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
  pasteMode: boolean;
  importHandlerActive: boolean;
}

function resetReplState(state: ReplState): void {
  state.multilineMode = false;
  state.multilineInput = "";
  state.parenBalance = 0;
  // Don't reset paste mode here, as it should persist until explicitly exited
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

async function commandLoad(
  parts: string[],
  evaluator: REPLEvaluator,
  history: string[],
  logger: Logger,
  baseDir: string,
  historySize: number,
  showAst: boolean,
  showExpanded: boolean,
  showJs: boolean,
  useColors: boolean,
): Promise<void> {
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
      historySize,
      showAst,
      showExpanded,
      showJs,
      useColors,
    });
    console.log(`File loaded successfully: ${filePath}`);
  } catch (error) {
    console.error(`Error loading file: ${error instanceof Error ? error.message : error}`);
  }
}

async function commandSave(parts: string[], history: string[]): Promise<void> {
  if (parts.length < 2) {
    console.error("Usage: :save <filename>");
    return;
  }
  const saveFilePath = parts.slice(1).join(" ");
  try {
    await Deno.writeTextFile(saveFilePath, history.join("\n"));
    console.log(`History saved to ${saveFilePath}`);
  } catch (error) {
    console.error(`Error saving history: ${error instanceof Error ? error.message : error}`);
  }
}

function commandColors(setColors: (val: boolean) => void, useColors: boolean): void {
  setColors(!useColors);
  console.log(`Colorized output ${useColors ? "enabled" : "disabled"}`);
}

function commandClear(): void {
  console.clear();
}

function commandPaste(state: ReplState): void {
  state.pasteMode = !state.pasteMode;
  if (state.pasteMode) {
    console.log("Paste mode enabled. Enter your multi-line code and use Ctrl+D to process it.");
    console.log("Or type ':end' on a line by itself to finish paste mode.");
  } else {
    console.log("Paste mode disabled.");
  }
}

function commandReset(evaluator: REPLEvaluator): void {
  console.log("Resetting REPL environment...");
  if (typeof evaluator.resetEnvironment === "function") {
    evaluator.resetEnvironment();
    console.log("Environment reset complete.");
  } else {
    console.log("Environment reset not supported.");
  }
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
  controlD: boolean; // Used to signal end of paste mode
}

async function readLineWithHistory(
  prompt: string, 
  history: string[], 
  state: ReplState
): Promise<ReadLineResult> {
  // If we're in paste mode, use a different input method that supports pasting
  if (state.pasteMode) {
    return readPasteInput(prompt);
  }

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
    
    // Check for paste (Ctrl+V on some systems)
    if ((key?.ctrlKey && key.key === "v") || 
        (key?.metaKey && key.key === "v")) {
      try {
        // Try to get clipboard content using clipboardHandler
        const clipboardContent = await clipboardHandler.read();
        if (clipboardContent && clipboardContent.trim()) {
          // Insert clipboard content at current cursor position
          currentInput = currentInput.slice(0, cursorPos) + 
                        clipboardContent + 
                        currentInput.slice(cursorPos);
          cursorPos += clipboardContent.length;
          await redrawLine();
        }
      } catch (error) {
        // Silently fail on clipboard access issues - system might not support it
      }
      continue;
    }

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
    } else if (key?.ctrlKey && key.key === "d") {
      if (currentInput.length === 0) {
        await Deno.stdout.write(encoder.encode("\nExiting REPL...\n"));
        Deno.exit(0);
      } else if (cursorPos < currentInput.length) {
        currentInput = currentInput.slice(0, cursorPos) + currentInput.slice(cursorPos + 1);
        await redrawLine();
      }
    } else if (key?.ctrlKey && key.key === "t") {
      if (cursorPos > 0 && cursorPos < currentInput.length) {
        const beforeChar = currentInput[cursorPos - 1];
        const atChar = currentInput[cursorPos];
        currentInput = currentInput.slice(0, cursorPos - 1) + atChar + beforeChar + currentInput.slice(cursorPos + 1);
        await redrawLine();
      }
    } else if (key?.sequence && !key.ctrlKey && !key.metaKey && !key.altKey) {
      currentInput = currentInput.slice(0, cursorPos) + key.sequence + currentInput.slice(cursorPos);
      cursorPos += key.sequence.length;
      await redrawLine();
    }
  }
}

/**
 * Read multi-line input in paste mode
 */
async function readPasteInput(prompt: string): Promise<ReadLineResult> {
  const encoder = new TextEncoder();
  await Deno.stdout.write(encoder.encode(prompt));
  
  let inputLines: string[] = [];
  
  // Create a BufReader from stdin
  const reader = readLines(Deno.stdin);
  
  for await (const line of reader) {
    if (line === ':end') {
      // End paste mode when user types ":end"
      await Deno.stdout.write(encoder.encode("\n"));
      break;
    }
    
    // Display the line as it's entered
    await Deno.stdout.write(encoder.encode(line + "\n"));
    
    // Add to our collection
    inputLines.push(line);
    
    // Check if we have a complete expression by counting parentheses
    let balance = 0;
    let inString = false;
    
    for (const inputLine of inputLines) {
      for (let i = 0; i < inputLine.length; i++) {
        const char = inputLine[i];
        
        // Handle string literals to avoid counting parens inside them
        if (char === '"' && (i === 0 || inputLine[i - 1] !== '\\')) {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === "(") balance++;
          else if (char === ")") balance--;
        }
      }
    }
    
    // If we reach a balance of 0 and have input, we can process it
    if (balance === 0 && inputLines.length > 0) {
      break;
    }
  }
  
  return { 
    text: inputLines.join('\n'), 
    fromHistory: false,
    controlD: false
  };
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
  // Check for end of paste mode via Ctrl+D
  if (lineResult.controlD && state.pasteMode) {
    state.pasteMode = false;
    console.log("Paste mode disabled.");
    return;
  }
  
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
  
  // Check for special import handling first
  if (isImportExpression(trimmed)) {
    // Use the evaluator's direct import processing
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
    
    // Mark that we've processed an import to prevent duplicate attempt in evaluation
    state.importHandlerActive = true;
    return;
  }
  
  try {
    registerSourceFile("REPL input", input);
    const result = await evaluator.evaluate(input, {
      showAst: options.showAst,
      showExpanded: options.showExpanded,
      showJs: options.showJs,
    });
    
    // No need to update anything related to imports here
    
    if (result.value !== undefined) {
      let displayValue = result.value;
      if (options.useColors) {
        if (displayValue === null)
          displayValue = `${colors.fg.lightBlue}null${colors.reset}`;
        else if (typeof displayValue === "number")
          displayValue = `${colors.fg.lightGreen}${displayValue}${colors.reset}`;
        else if (typeof displayValue === "string")
          displayValue = `${colors.fg.lightYellow}"${displayValue}"${colors.reset}`;
        else if (typeof displayValue === "boolean")
          displayValue = `${colors.fg.lightPurple}${displayValue}${colors.reset}`;
        else if (typeof displayValue === "object") {
          try {
            displayValue = `${colors.fg.lightCyan}${JSON.stringify(displayValue, null, 2)}${colors.reset}`;
          } catch {
            displayValue = `${colors.fg.lightCyan}${displayValue}${colors.reset}`;
          }
        }
      }
      console.log(displayValue);
    } else if (input.trim().startsWith("(fn ") || input.trim().startsWith("(defn ")) {
      const match = input.trim().match(/\(fn\s+([a-zA-Z0-9_-]+)/) ||
                    input.trim().match(/\(defn\s+([a-zA-Z0-9_-]+)/);
      const functionName = match ? match[1] : "anonymous";
      console.log(options.useColors
        ? `${colors.fg.lightGreen}Function ${functionName} defined${colors.reset}`
        : `Function ${functionName} defined`);
    } else if (input.trim().startsWith("(def ")) {
      const match = input.trim().match(/\(def\s+([a-zA-Z0-9_-]+)/);
      const varName = match ? match[1] : "value";
      console.log(options.useColors
        ? `${colors.fg.lightGreen}Variable ${varName} defined${colors.reset}`
        : `Variable ${varName} defined`);
    } else {
      console.log(options.useColors
        ? `${colors.fg.lightBlue}undefined${colors.reset}`
        : "undefined");
    }
    
    // Display additional information if requested
    if (options.showAst)
      printBlock("AST:", JSON.stringify(result.parsedExpressions, null, 2), options.useColors);
    if (options.showExpanded)
      printBlock("Expanded:", JSON.stringify(result.expandedExpressions, null, 2), options.useColors);
    if (options.showJs)
      printBlock("JavaScript:", result.jsCode, options.useColors);
    
    // Track symbol usage if a tracker is provided
    if (options.trackSymbolUsage) {
      const symbolRegex = /\b[a-zA-Z0-9_-]+\b/g;
      let m;
      while ((m = symbolRegex.exec(input)) !== null) {
        options.trackSymbolUsage(m[0]);
      }
    }
  } catch (error) {
    // Check for import-related errors and handle them specially
    if ((error instanceof ImportError || 
         (error instanceof Error && error.message.includes("import")) ||
         (error.toString().includes("import"))) && 
        !state.importHandlerActive) {
      
      // Try to handle this as a dynamic import if it looks like an import expression
      if (isImportExpression(trimmed)) {
        await handleImportExpression(trimmed, options.dynamicImporter, options.useColors);
        return;
      }
    }
    
    // Reset import handler flag
    state.importHandlerActive = false;
    
    // Format and display the error
    if (error instanceof Error) {
      const formattedError = formatError(error, { 
        useColors: options.useColors, 
        filePath: "REPL input" 
      });
      const suggestion = getSuggestion(error);
      console.error(options.useColors
        ? `${colors.fg.red}${formattedError}${colors.reset}`
        : formattedError);
      
      if (suggestion) {
        console.error(options.useColors
          ? `${colors.fg.cyan}Suggestion: ${suggestion}${colors.reset}`
          : `Suggestion: ${suggestion}`);
      }
    } else {
      console.error(options.useColors
        ? `${colors.fg.red}Error: ${String(error)}${colors.reset}`
        : `Error: ${String(error)}`);
    }
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
    case ":verbose":
      commandVerbose(options.logger, options.replState.setVerbose);
      break;
    case ":ast":
      commandAst(options.showAst, options.replState.setShowAst);
      break;
    case ":expanded":
      commandExpanded(options.showExpanded, options.replState.setShowExpanded);
      break;
    case ":js":
      commandJs(options.showJs, options.replState.setShowJs);
      break;
    case ":load":
      await commandLoad(
        parts, 
        evaluator, 
        history, 
        options.logger, 
        options.baseDir, 
        options.historySize, 
        options.showAst, 
        options.showExpanded, 
        options.showJs, 
        options.useColors,
        options.dynamicImporter
      );
      break;
    case ":save":
      await commandSave(parts, history);
      break;
    case ":colors":
      commandColors(options.replState.setColors, options.useColors);
      break;
    case ":clear":
      commandClear();
      break;
    case ":paste":
      commandPaste(state);
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
    pasteMode = false,
  } = options;

  let running = true;
  const history: string[] = historyManager.load(historySize);
  const replStateObj: ReplState = { 
    multilineMode: false, 
    multilineInput: "", 
    parenBalance: 0,
    pasteMode,
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
    
    // No need for a separate dynamic importer
    
    // Log available macros in verbose mode
    if (options.verbose) {
      logger.log({ 
        text: `Available macros: ${[...env.macros.keys()].join(", ")}`, 
        namespace: "repl" 
      });
    }

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
        console.error(`Error loading initial file: ${error instanceof Error ? error.message : error}`);
      }
    }

    while (running) {
      try {
        const prompt = getPrompt(replStateObj.multilineMode, replStateObj.pasteMode, useColors);
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
        printError(`Error: ${error instanceof Error ? error.message : error}`, useColors);
        resetReplState(replStateObj);
      }
    }
    console.log("\nGoodbye!");
  } catch (error) {
    console.error(`REPL initialization error: ${error instanceof Error ? error.message : error}`);
    if (error instanceof Error && error.stack) console.error(error.stack);
  }
}

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
  }
): Promise<void> {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(options.baseDir, filePath);
    
  if (!(await exists(resolvedPath))) {
    throw new Error(`File not found: ${resolvedPath}`);
  }
  
  const fileContent = await Deno.readTextFile(resolvedPath);
  
  console.log(options.useColors
    ? `${colors.fg.sicpRed}Loading file: ${resolvedPath}${colors.reset}`
    : `Loading file: ${resolvedPath}`);
    
  // Create a temporary state object just for file processing
  const tempState: ReplState = {
    multilineMode: false,
    multilineInput: "",
    parenBalance: 0,
    pasteMode: false,
    importHandlerActive: false
  };
    
  await processInput(fileContent, evaluator, history, options, tempState);
}

if (import.meta.main) {
  startRepl();
}