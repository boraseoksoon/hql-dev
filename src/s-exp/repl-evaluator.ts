// src/s-exp/repl-evaluator.ts - Evaluator for the REPL that maintains state

import { parse } from "../transpiler/parser.ts";
import { transformSyntax } from "../transpiler/syntax-transformer.ts";
import { expandMacros } from "./macro.ts";
import { processImports } from "./imports.ts";
import { convertToHqlAst } from "./macro-reader.ts";
import { transformAST } from "../transformer.ts";
import { Logger } from "../logger.ts";
import { REPLEnvironment } from "./repl-environment.ts";
import { Environment } from "../environment.ts";
import { SExp } from "./types.ts";
import { RUNTIME_FUNCTIONS } from "../transpiler/runtime.ts";

// Options for REPL evaluation
export interface REPLEvalOptions {
  verbose?: boolean;
  baseDir?: string;
  showAst?: boolean;
  showExpanded?: boolean;
  showJs?: boolean;
}

// Result of REPL evaluation
export interface REPLEvalResult {
  value: any;
  jsCode: string;
  parsedExpressions: SExp[];
  expandedExpressions: SExp[];
}

/**
 * REPL evaluator that maintains state between evaluations
 */
export class REPLEvaluator {
  private replEnv: REPLEnvironment;
  private logger: Logger;
  private baseDir: string;
  private runtimeFunctionsInitialized = false;
  
  constructor(env: Environment, options: REPLEvalOptions = {}) {
    this.replEnv = new REPLEnvironment(env, { verbose: options.verbose });
    this.logger = new Logger(options.verbose || false);
    this.baseDir = options.baseDir || Deno.cwd();
    
    // Initialize runtime functions immediately
    this.initializeRuntimeFunctions();
  }
  
  /**
   * Initialize the runtime functions once to avoid redefinition errors
   */
  private async initializeRuntimeFunctions(): Promise<void> {
    if (this.runtimeFunctionsInitialized) return;
    
    try {
      // Extract the runtime functions - removing the function declarations
      // that would cause redeclaration errors
      const runtimeCode = RUNTIME_FUNCTIONS.trim();
      
      // Register all runtime functions in the environment
      await this.evaluateJs(runtimeCode);
      
      this.runtimeFunctionsInitialized = true;
      this.logger.debug("Runtime functions initialized");
    } catch (error) {
      this.logger.error(`Failed to initialize runtime functions: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Parse a single line of input
   */
  parseLine(input: string): SExp[] {
    try {
      return parse(input);
    } catch (error) {
      this.logger.error(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Evaluate a single line of input and return the result
   */
  async evaluate(input: string, options: REPLEvalOptions = {}): Promise<REPLEvalResult> {
    const logger = new Logger(options.verbose || false);
    
    try {
      // Set current file in the environment
      this.replEnv.hqlEnv.setCurrentFile(options.baseDir || this.baseDir);
      
      // 1. Parse
      if (logger.isVerbose) logger.debug("Parsing input...");
      const sexps = parse(input);
      if (logger.isVerbose) logger.debug(`Parsed ${sexps.length} expressions`);
      
      // 2. Syntax Transform
      if (logger.isVerbose) logger.debug("Transforming syntax...");
      const transformedSexps = transformSyntax(sexps, { verbose: options.verbose });
      if (logger.isVerbose) logger.debug(`Transformed to ${transformedSexps.length} expressions`);
      
      // 3. Process imports
      if (logger.isVerbose) logger.debug("Processing imports...");
      await processImports(transformedSexps, this.replEnv.hqlEnv, {
        verbose: options.verbose,
        baseDir: options.baseDir || this.baseDir,
      });
      
      // 4. Expand macros
      if (logger.isVerbose) logger.debug("Expanding macros...");
      const expanded = expandMacros(transformedSexps, this.replEnv.hqlEnv, {
        verbose: options.verbose,
        currentFile: options.baseDir || this.baseDir,
      });
      
      // 5. Convert to HQL AST
      if (logger.isVerbose) logger.debug("Converting to HQL AST...");
      const hqlAst = convertToHqlAst(expanded, { verbose: options.verbose });
      
      // 6. Transform to JavaScript
      if (logger.isVerbose) logger.debug("Transforming to JavaScript...");
      const jsCode = await transformAST(hqlAst, options.baseDir || this.baseDir, { 
        verbose: options.verbose,
        replMode: true // Add REPL mode flag
      });
      
      // 7. Prepare JS for REPL and evaluate
      // Strip out runtime function declarations to avoid redefinition errors
      const cleanedCode = this.removeRuntimeFunctions(jsCode);
      const preparedJs = this.replEnv.prepareJsForRepl(cleanedCode);
      if (logger.isVerbose) logger.debug("Evaluating JavaScript...");
      
      // 8. Evaluate with stateful environment
      const result = await this.evaluateJs(preparedJs);
      
      // Reset current file in environment
      this.replEnv.hqlEnv.setCurrentFile(null);
      
      return {
        value: result,
        jsCode: preparedJs,
        parsedExpressions: sexps,
        expandedExpressions: expanded,
      };
    } catch (error) {
      this.replEnv.hqlEnv.setCurrentFile(null);
      throw error;
    }
  }
  
  /**
   * Remove runtime function declarations from code to avoid redefinition errors
   */
  private removeRuntimeFunctions(code: string): string {
    // Extract the function names from the runtime code
    const functionNames = this.extractRuntimeFunctionNames();
    
    // For each runtime function, remove its function declaration
    let cleanedCode = code;
    for (const funcName of functionNames) {
      // Use a more specific regex that doesn't break other functions
      const funcRegex = new RegExp(`function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\}`, 'g');
      cleanedCode = cleanedCode.replace(funcRegex, '');
    }
    
    return cleanedCode.trim();
  }
  
  /**
   * Extract function names from runtime code
   */
  private extractRuntimeFunctionNames(): string[] {
    const runtimeFunctionNames: string[] = [];
    const funcNameRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    const runtimeCode = RUNTIME_FUNCTIONS;
    
    let match;
    while ((match = funcNameRegex.exec(runtimeCode)) !== null) {
      if (match[1]) {
        runtimeFunctionNames.push(match[1]);
      }
    }
    
    return runtimeFunctionNames;
  }
  
  /**
   * Evaluate JavaScript code in the REPL environment
   */
  private async evaluateJs(code: string): Promise<any> {
    // Create a function with access to the REPL environment
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    try {
      // Create context with all defined symbols
      const context = this.replEnv.createEvalContext();
      
      // Create a wrapped function that executes and returns the code's result
      const wrappedCode = `
        try {
          ${context}
          
          // Execute code and return its result
          const result = (async () => {
            ${code}
          })();
          
          ${this.logger.isVerbose ? 'console.log("DEBUG: Evaluation result type:", typeof result);' : ''}
          return result;
        } catch (error) {
          console.error("Evaluation error:", error);
          throw error;
        }
      `;
      
      if (this.logger.isVerbose) {
        console.log("DEBUG: Evaluating wrapped code:");
        console.log(wrappedCode);
      }
      
      // Create and execute the function
      const fn = new AsyncFunction(
        "replEnv", 
        wrappedCode + "\n//# sourceURL=repl-eval.js"
      );
      
      return await fn(this.replEnv);
    } catch (error) {
      this.logger.error(`Evaluation error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Get the REPL environment
   */
  getEnvironment(): REPLEnvironment {
    return this.replEnv;
  }
} 