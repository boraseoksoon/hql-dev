// src/repl/repl.ts
import { parse } from "../transpiler/parser.ts";
import { Environment } from "../environment.ts";
import { expandMacros } from "../s-exp/macro.ts";
import { processImports } from "../s-exp/imports.ts";
import { sexpToString } from "../s-exp/types.ts";
import { convertToHqlAst } from "../s-exp/macro-reader.ts";
import { transformAST } from "../transformer.ts";
import { Logger } from "../logger.ts";
import { transformSyntax } from "../transpiler/syntax-transformer.ts";
import { loadSystemMacros } from "../transpiler/hql-transpiler.ts";
import { RUNTIME_FUNCTIONS } from "../transpiler/runtime.ts";
import { sanitizeIdentifier } from "../utils.ts";
import {
  ParseError,
  MacroError,
  ImportError,
  TranspilerError,
  TransformError,
} from "../transpiler/errors.ts";

/**
 * Configuration for the REPL.
 */
export interface ReplOptions {
  verbose?: boolean;
  baseDir?: string;
  historySize?: number;
  showAst?: boolean;
  showExpanded?: boolean;
  showJs?: boolean;
}

/**
 * State-preserving REPL that maintains environment between evaluations
 */
export class StatefulRepl {
  private env: Environment;
  private logger: Logger;
  private history: string[] = [];
  private options: ReplOptions;
  private baseDir: string;
  private initialized = false;
  private evalContext: Record<string, any> = {};
  
  /**
   * Create a new REPL instance
   */
  constructor(options: ReplOptions = {}) {
    this.options = {
      verbose: false,
      historySize: 100,
      showAst: false,
      showExpanded: false,
      showJs: false,
      ...options
    };
    
    this.logger = new Logger(this.options.verbose);
    this.baseDir = this.options.baseDir || Deno.cwd();
  }
  
  /**
   * Initialize the REPL environment
   */
  async initialize(): Promise<void> {
    try {
      this.logger.debug("Initializing REPL environment");
      
      // Initialize the environment
      this.env = await Environment.initializeGlobalEnv({
        verbose: this.options.verbose
      });
      
      this.env.setCurrentFile(this.baseDir);
      
      // Load system macros
      await loadSystemMacros(this.env, {
        verbose: this.options.verbose,
        baseDir: this.baseDir
      });
      
      // Set up the evaluation context with runtime functions
      this.setupEvaluationContext();
      
      this.initialized = true;
      this.logger.debug("REPL initialization complete");
    } catch (error) {
      this.logger.error(`Failed to initialize REPL: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Set up the JavaScript evaluation context
   */
  private setupEvaluationContext(): void {
    // Parse the runtime functions and add them to the context
    const runtimeFuncMatch = RUNTIME_FUNCTIONS.match(/function\s+(\w+)\s*\(/);
    if (runtimeFuncMatch && runtimeFuncMatch[1]) {
      const funcName = runtimeFuncMatch[1];
      
      // Create a function that evaluates the runtime code
      const runtimeEval = new Function(
        `${RUNTIME_FUNCTIONS}\nreturn ${funcName};`
      );
      
      // Add the runtime function to the context
      this.evalContext[funcName] = runtimeEval();
      this.logger.debug(`Added runtime function: ${funcName}`);
    }
    
    // Add other standard JS functions that might be needed
    this.evalContext.console = console;
    this.evalContext.setTimeout = setTimeout;
    this.evalContext.clearTimeout = clearTimeout;
    this.evalContext.setInterval = setInterval;
    this.evalContext.clearInterval = clearInterval;
  }
  
  /**
   * Evaluate a single expression
   */
  async evaluate(input: string): Promise<any> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!input.trim()) {
      return null;
    }
    
    // Update history
    if (this.history.length >= this.options.historySize!) {
      this.history.shift();
    }
    this.history.push(input);
    
    try {
      // Step 1: Parse
      const sexps = this.parse(input);
      if (sexps.length === 0) {
        return null;
      }
      
      // Step 2: Syntax Transform
      const canonicalSexps = this.transformSyntax(sexps);
      
      // Detect and handle special forms with side effects
      if (this.isDefinition(canonicalSexps[0])) {
        return this.handleDefinition(canonicalSexps);
      }
      
      // Step 3: Process imports
      await this.processImports(canonicalSexps);
      
      // Step 4: Expand macros
      const expanded = this.expandMacros(canonicalSexps);
      
      // Step 5: Convert to HQL AST
      const hqlAst = this.convertToAst(expanded);
      
      // Step 6: Transform to JavaScript
      const jsCode = await this.transformToJs(hqlAst);
      
      // Step 7: Evaluate in the current context
      return this.evaluateJs(jsCode);
    } catch (error) {
      this.handleEvaluationError(error, input);
      throw error;
    }
  }
  
  /**
   * Parse a string into S-expressions
   */
  private parse(input: string): any[] {
    try {
      const sexps = parse(input);
      this.logger.debug(`Parsed ${sexps.length} S-expressions`);
      if (this.options.showAst) {
        this.logExpressions("Parsed", sexps);
      }
      return sexps;
    } catch (error) {
      if (error instanceof ParseError) throw error;
      throw new ParseError(`Failed to parse input: ${error.message}`, { line: 1, column: 1, offset: 0 }, input);
    }
  }
  
  /**
   * Transform S-expressions with syntax transformations
   */
  private transformSyntax(sexps: any[]): any[] {
    try {
      const result = transformSyntax(sexps, { verbose: this.options.verbose });
      this.logger.debug(`Transformed ${result.length} expressions`);
      if (this.options.showAst) {
        this.logExpressions("Transformed", result);
      }
      return result;
    } catch (error) {
      if (error instanceof TransformError) throw error;
      throw new TransformError(`Failed to transform syntax: ${error.message}`, "syntax transformation", "valid HQL expressions", sexps);
    }
  }
  
  /**
   * Process imports in the S-expressions
   */
  private async processImports(sexps: any[]): Promise<void> {
    try {
      await processImports(sexps, this.env, {
        verbose: this.options.verbose,
        baseDir: this.baseDir,
        currentFile: this.baseDir
      });
    } catch (error) {
      if (error instanceof ImportError) throw error;
      throw new ImportError(`Failed to process imports: ${error.message}`, "unknown", this.baseDir, error);
    }
  }
  
  /**
   * Expand macros in the S-expressions
   */
  private expandMacros(sexps: any[]): any[] {
    try {
      const expanded = expandMacros(sexps, this.env, {
        verbose: this.options.verbose,
        currentFile: this.baseDir,
        useCache: true
      });
      
      if (this.options.showExpanded) {
        this.logExpressions("Expanded", expanded);
      }
      
      return expanded;
    } catch (error) {
      if (error instanceof MacroError) throw error;
      throw new MacroError(`Failed to expand macros: ${error.message}`, "", this.baseDir, error);
    }
  }
  
  /**
   * Convert expanded S-expressions to HQL AST
   */
  private convertToAst(expanded: any[]): any[] {
    try {
      const hqlAst = convertToHqlAst(expanded, { verbose: this.options.verbose });
      return hqlAst;
    } catch (error) {
      throw new TranspilerError(`Failed to convert to AST: ${error.message}`);
    }
  }
  
  /**
   * Transform HQL AST to JavaScript
   */
  private async transformToJs(hqlAst: any[]): Promise<string> {
    try {
      const jsCode = await transformAST(hqlAst, this.baseDir, { verbose: this.options.verbose });
      
      if (this.options.showJs) {
        console.log("JavaScript:");
        console.log("```javascript");
        console.log(jsCode);
        console.log("```");
      }
      
      return jsCode;
    } catch (error) {
      throw new TranspilerError(`Failed to transform to JavaScript: ${error.message}`);
    }
  }
  
  /**
   * Evaluate JavaScript code in the REPL context
   */
  private evaluateJs(jsCode: string): any {
    try {
      // Create a function from all the symbols in our context
      const contextKeys = Object.keys(this.evalContext);
      
      // Create a special wrapper for evaluating the code that captures its result
      // We use a function constructor to create a function that can be called with our context variables
      const evalFunc = new Function(
        ...contextKeys,
        `return ${jsCode}`
      );
      
      // Call the function with the context values
      return evalFunc(...contextKeys.map(key => this.evalContext[key]));
    } catch (error) {
      throw new TranspilerError(`Failed to evaluate JavaScript: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Add a value to the evaluation context
   */
  private addToContext(name: string, value: any): void {
    const safeName = sanitizeIdentifier(name);
    this.evalContext[safeName] = value;
    this.logger.debug(`Added to context: ${safeName}`);
  }
  
  /**
   * Check if an S-expression is a definition (let, var, fn, fx, defn)
   */
  private isDefinition(expr: any): boolean {
    if (!expr || expr.type !== "list" || expr.elements.length < 3) {
      return false;
    }
    
    const firstElem = expr.elements[0];
    if (firstElem.type !== "symbol") {
      return false;
    }
    
    const op = firstElem.name;
    return (op === "let" || op === "var" || op === "fn" || op === "fx" || op === "defn") && 
           expr.elements[1].type === "symbol";
  }
  
  /**
   * Handle a definition expression (let, var, fn, fx, defn)
   */
  private async handleDefinition(sexps: any[]): Promise<string> {
    try {
      const expr = sexps[0];
      const op = expr.elements[0].name;
      const name = expr.elements[1].name;
      
      // Process through the normal pipeline to get JavaScript
      const expanded = this.expandMacros(sexps);
      const hqlAst = this.convertToAst(expanded);
      const jsCode = await this.transformToJs(hqlAst);
      
      // Evaluate the JavaScript to define the symbol
      const result = this.evaluateJs(jsCode);
      
      // For functions, store the result with the name
      if (op === "fn" || op === "fx" || op === "defn") {
        this.addToContext(name, result);
        return `Function ${name} defined`;
      } else if (op === "let" || op === "var") {
        this.addToContext(name, result);
        return `Variable ${name} = ${JSON.stringify(result)}`;
      }
      
      return `Defined ${name}`;
    } catch (error) {
      throw new TranspilerError(`Failed to process definition: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Log array of expressions for debugging
   */
  private logExpressions(label: string, sexps: any[]): void {
    const maxLog = 5;
    console.log(`${label} ${sexps.length} expressions`);
    sexps.slice(0, maxLog).forEach((s, i) => 
      console.log(`${label} ${i + 1}: ${sexpToString(s)}`)
    );
    if (sexps.length > maxLog) {
      console.log(`...and ${sexps.length - maxLog} more expressions`);
    }
  }
  
  /**
   * Handle evaluation errors
   */
  private handleEvaluationError(error: any, input: string): void {
    this.logger.error(`Error evaluating input: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  /**
   * Get REPL history
   */
  getHistory(): string[] {
    return [...this.history];
  }
  
  /**
   * Get defined symbols
   */
  getDefinedSymbols(): string[] {
    return Object.keys(this.evalContext);
  }
  
  /**
   * Set option value
   */
  setOption<K extends keyof ReplOptions>(
    option: K, 
    value: ReplOptions[K]
  ): void {
    this.options[option] = value;
    if (option === "verbose") {
      this.logger.setEnabled(value as boolean);
    }
  }
  
  /**
   * Get the current value of an option
   */
  getOption<K extends keyof ReplOptions>(option: K): ReplOptions[K] {
    return this.options[option];
  }
  
  /**
   * Get the environment
   */
  getEnvironment(): Environment {
    return this.env;
  }
}

/**
 * Displays the REPL banner.
 */
function printBanner(): void {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log(
    "║                HQL Stateful REPL                           ║",
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
    "║    :symbols - Show defined symbols                          ║",
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
  
  printBanner();
  
  // Create and initialize the enhanced REPL
  const repl = new StatefulRepl(options);
  await repl.initialize();
  
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
      
      // Handle multiline input
      if (multilineMode) {
        multilineInput += line + "\n";
        for (const char of line) {
          if (char === "(") parenBalance++;
          else if (char === ")") parenBalance--;
        }
        if (parenBalance <= 0) {
          multilineMode = false;
          await processInput(multilineInput, repl);
          multilineInput = "";
          parenBalance = 0;
        }
        continue;
      }
      
      // Handle special commands
      if (line.startsWith(":")) {
        await handleCommand(line, repl, running, (value) => {
          running = value;
        });
        continue;
      }
      
      // Check if input is incomplete
      for (const char of line) {
        if (char === "(") parenBalance++;
        else if (char === ")") parenBalance--;
      }
      if (parenBalance > 0) {
        multilineMode = true;
        multilineInput = line + "\n";
        continue;
      }
      
      await processInput(line, repl);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errMsg}`);
      if (error instanceof Error && error.stack && options.verbose) {
        console.error(error.stack);
      }
      multilineMode = false;
      multilineInput = "";
      parenBalance = 0;
    }
  }
  
  console.log("\nGoodbye!");
}

/**
 * Process a single line of input
 */
async function processInput(input: string, repl: StatefulRepl): Promise<void> {
  if (!input.trim()) return;
  
  try {
    const result = await repl.evaluate(input);
    console.log("=> ", result);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${errMsg}`);
    if (error instanceof Error && error.stack && repl.getOption("verbose")) {
      console.error(error.stack);
    }
  }
}

/**
 * Handle special REPL commands
 */
async function handleCommand(
    command: string,
    repl: StatefulRepl,
    running: boolean,
    setRunning: (value: boolean) => void
  ): Promise<void> {
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
  
    switch (cmd) {
      case ":help":
      case ":h": {
        printBanner();
        break;
      }
  
      case ":quit":
      case ":exit":
      case ":q": {
        setRunning(false);
        break;
      }
  
      case ":env": {
        console.log("Environment bindings: (simplified view)\n");
        const env = repl.getEnvironment();
        // Display variables from environment
        if (env.variables.size === 0) {
          console.log("No environment variables defined.");
        } else {
          for (const [key, value] of env.variables.entries()) {
            console.log(`${key}: ${formatValue(value)}`);
          }
        }
        break;
      }
  
      case ":symbols": {
        console.log("Defined symbols:\n");
        const symbols = repl.getDefinedSymbols();
        if (symbols.length === 0) {
          console.log("No symbols defined yet.");
        } else {
          symbols.forEach((symbol) => console.log(`- ${symbol}`));
        }
        break;
      }
  
      case ":verbose": {
        const verbose = !repl.getOption("verbose");
        repl.setOption("verbose", verbose);
        console.log(`Verbose mode: ${verbose ? "on" : "off"}`);
        break;
      }
  
      case ":ast": {
        const showAst = !repl.getOption("showAst");
        repl.setOption("showAst", showAst);
        console.log(`AST display: ${showAst ? "on" : "off"}`);
        break;
      }
  
      case ":expanded": {
        const showExpanded = !repl.getOption("showExpanded");
        repl.setOption("showExpanded", showExpanded);
        console.log(`Expanded form display: ${showExpanded ? "on" : "off"}`);
        break;
      }
  
      case ":js": {
        const showJs = !repl.getOption("showJs");
        repl.setOption("showJs", showJs);
        console.log(`JavaScript display: ${showJs ? "on" : "off"}`);
        break;
      }
  
      case ":load": {
        if (parts.length < 2) {
          console.error("Usage: :load <filename>");
          break;
        }
  
        try {
          const filename = parts.slice(1).join(" ");
          const content = await Deno.readTextFile(filename);
          console.log(`Loading file: ${filename}`);
          await processInput(content, repl);
        } catch (error) {
          console.error(
            `Error loading file: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
  
      case ":save": {
        if (parts.length < 2) {
          console.error("Usage: :save <filename>");
          break;
        }
  
        try {
          const filename = parts.slice(1).join(" ");
          await Deno.writeTextFile(filename, repl.getHistory().join("\n"));
          console.log(`History saved to: ${filename}`);
        } catch (error) {
          console.error(
            `Error saving history: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
        break;
      }
  
      case ":clear": {
        console.log("\x1Bc");
        break;
      }
  
      default: {
        console.error(`Unknown command: ${cmd}`);
        console.log("Type :help for available commands");
        break;
      }
    }
  }  

/**
 * Format a value for display
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  
  if (typeof value === 'function') {
    return '[Function]';
  }
  
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return `[Array: ${value.length} items]`;
    }
    
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return '[Object]';
    }
  }
  
  return String(value);
}

// Run as script if invoked directly
if (import.meta.main) {
  startRepl({
    verbose: Deno.args.includes("--verbose") || Deno.args.includes("-v"),
    showAst: Deno.args.includes("--ast"),
    showExpanded: Deno.args.includes("--expanded"),
    showJs: Deno.args.includes("--js"),
  }).catch(console.error);
}