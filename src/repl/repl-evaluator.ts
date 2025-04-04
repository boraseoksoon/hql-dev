// src/s-exp/repl-evaluator.ts - Evaluator for the REPL that maintains state

import { parse } from "../transpiler/pipeline/parser.ts";
import { transformSyntax } from "../transpiler/pipeline/syntax-transformer.ts";
import { expandMacros } from "../s-exp/macro.ts";
import { processImports } from "../imports.ts";
import { convertToHqlAst } from "../s-exp/macro-reader.ts";
import { transformAST } from "../transformer.ts";
import { Logger } from "../logger.ts";
import { REPLEnvironment } from "./repl-environment.ts";
import { Environment, Value } from "../environment.ts";
import { SExp } from "../s-exp/types.ts";
import { RUNTIME_FUNCTIONS } from "../transpiler/runtime/runtime.ts";
import { 
  registerSourceFile, 
  withErrorHandling, 
  withTypeScriptErrorTranslation
} from "../transpiler/error/error-handling.ts";

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
  value: Value;
  jsCode: string;
  parsedExpressions: SExp[];
  expandedExpressions: SExp[];
  executionTimeMs?: number;
}

// Performance metrics for evaluation stages
export interface EvaluationMetrics {
  parseTimeMs: number;
  syntaxTransformTimeMs: number;
  importProcessingTimeMs: number;
  macroExpansionTimeMs: number;
  astConversionTimeMs: number;
  codeGenerationTimeMs: number;
  evaluationTimeMs: number;
  totalTimeMs: number;
}

/**
 * REPL evaluator that maintains state between evaluations
 */
export class REPLEvaluator {
  private replEnv: REPLEnvironment;
  private logger: Logger;
  private baseDir: string;
  private runtimeFunctionsInitialized = false;
  private runtimeFunctionNames: string[] | null = null;
  public repl: any; // Reference to REPL instance for error handling
  
  // Cache for parsed expressions to speed up repeat evaluations
  private parseCache: Map<string, SExp[]> = new Map();
  
  // Metrics for performance monitoring
  private lastMetrics: EvaluationMetrics | null = null;
  
  constructor(env: Environment, options: REPLEvalOptions = {}) {
    this.replEnv = new REPLEnvironment(env, { verbose: options.verbose });
    this.logger = new Logger(options.verbose || false);
    this.baseDir = options.baseDir || Deno.cwd();
    
    // Initialize runtime functions immediately
    this.initializeRuntimeFunctions();
  }
  
  /**
   * Set the REPL instance for error handling
   */
  setReplInstance(repl: any): void {
    this.repl = repl;
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
   * Uses caching to avoid re-parsing identical input
   */
  async parseLine(input: string): Promise<SExp[]> {
    // Check cache first
    if (this.parseCache.has(input)) {
      return this.parseCache.get(input)!;
    }
    
    // Register the input source for error enhancement
    registerSourceFile("REPL", input);
    
    // Use enhanced error handling
    return await withErrorHandling(
      () => {
        try {
          const result = parse(input);
          // Cache the result for future use
          this.parseCache.set(input, result);
          return result;
        } catch (error) {
          this.logger.error(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      },
      { source: input, filePath: "REPL", context: "REPL parsing" }
    )();
  }
  
  /**
   * Evaluate a single line of input and return the result
   * Measures performance metrics for each stage
   */
  async evaluate(input: string, options: REPLEvalOptions = {}): Promise<REPLEvalResult> {
    // Register the input for error context
    registerSourceFile("REPL", input);
    
    const log = (message: string) => {
      if (this.logger.isVerbose) this.logger.debug(message);
    };
    
    // Reset metrics
    const metrics: EvaluationMetrics = {
      parseTimeMs: 0,
      syntaxTransformTimeMs: 0,
      importProcessingTimeMs: 0,
      macroExpansionTimeMs: 0,
      astConversionTimeMs: 0,
      codeGenerationTimeMs: 0,
      evaluationTimeMs: 0,
      totalTimeMs: 0
    };
    
    const startTime = performance.now();
    let currentTime;
    
    try {
      // Set current file in the environment
      this.replEnv.hqlEnv.setCurrentFile(options.baseDir || this.baseDir);
      
      // Process the input through the evaluation pipeline
      log("Parsing input...");
      currentTime = performance.now();
      const sexps = await withErrorHandling(
        () => this.parseLine(input),
        { source: input, filePath: "REPL", context: "REPL parsing" }
      )();
      metrics.parseTimeMs = performance.now() - currentTime;
      log(`Parsed ${sexps.length} expressions`);
      
      log("Transforming syntax...");
      currentTime = performance.now();
      const transformedSexps = await withErrorHandling(
        () => transformSyntax(sexps, { verbose: options.verbose }),
        { source: input, filePath: "REPL", context: "REPL syntax transformation" }
      )();
      metrics.syntaxTransformTimeMs = performance.now() - currentTime;
      log(`Transformed to ${transformedSexps.length} expressions`);
      
      log("Processing imports...");
      currentTime = performance.now();
      await withErrorHandling(
        async () => {
          await processImports(transformedSexps, this.replEnv.hqlEnv, {
            verbose: options.verbose,
            baseDir: options.baseDir || this.baseDir,
            skipRebuild: true,
          });
        },
        { source: input, filePath: "REPL", context: "REPL import processing" }
      )();
      metrics.importProcessingTimeMs = performance.now() - currentTime;
      
      log("Expanding macros...");
      currentTime = performance.now();
      const expanded = await withErrorHandling(
        () => expandMacros(transformedSexps, this.replEnv.hqlEnv, {
          verbose: options.verbose,
          currentFile: options.baseDir || this.baseDir,
        }),
        { source: input, filePath: "REPL", context: "REPL macro expansion" }
      )();
      metrics.macroExpansionTimeMs = performance.now() - currentTime;
      
      log("Converting to HQL AST...");
      currentTime = performance.now();
      const hqlAst = await withErrorHandling(
        () => convertToHqlAst(expanded, { verbose: options.verbose }),
        { source: input, filePath: "REPL", context: "REPL AST conversion" }
      )();
      metrics.astConversionTimeMs = performance.now() - currentTime;
      
      log("Transforming to JavaScript...");
      currentTime = performance.now();
      const jsCode = await withTypeScriptErrorTranslation(
        withErrorHandling(
          () => transformAST(hqlAst, options.baseDir || this.baseDir, { 
            verbose: options.verbose,
            replMode: true
          }),
          { source: input, filePath: "REPL", context: "REPL JS transformation" }
        )
      )();
      metrics.codeGenerationTimeMs = performance.now() - currentTime;
      
      // Clean, prepare, and evaluate the JavaScript
      log("Evaluating JavaScript...");
      currentTime = performance.now();
      const cleanedCode = this.removeRuntimeFunctions(jsCode);
      const preparedJs = this.replEnv.prepareJsForRepl(cleanedCode);
      const result = await withErrorHandling(
        () => this.evaluateJs(preparedJs),
        { source: preparedJs, filePath: "REPL JS", context: "REPL JS evaluation" }
      )();
      metrics.evaluationTimeMs = performance.now() - currentTime;
      
      // Reset current file in environment
      this.replEnv.hqlEnv.setCurrentFile(null);
      
      // Calculate total time
      metrics.totalTimeMs = performance.now() - startTime;
      this.lastMetrics = metrics;
      
      // Return the full result
      return {
        value: result,
        jsCode: preparedJs,
        parsedExpressions: sexps,
        expandedExpressions: expanded,
        executionTimeMs: metrics.totalTimeMs
      };
    } catch (error) {
      // Enhance the error with source context
      const enhancedError = ErrorUtils.enhanceError(
        error instanceof Error ? error : new Error(String(error)),
        { source: input, filePath: "REPL" }
      );
      
      // Reset environment state
      this.replEnv.hqlEnv.setCurrentFile(null);
      
      // Rethrow the enhanced error
      throw enhancedError;
    }
  }
  
  /**
   * Get access to the environment
   */
  getEnvironment(): Environment {
    return this.replEnv.hqlEnv;
  }
  
  /**
   * Get the last recorded metrics
   */
  getLastMetrics(): EvaluationMetrics | null {
    return this.lastMetrics;
  }
  
  /**
   * Log performance metrics for debugging
   */
  logPerformanceMetrics(): void {
    if (!this.lastMetrics) {
      this.logger.debug("No performance metrics available");
      return;
    }
    
    this.logger.debug("Performance metrics:");
    this.logger.debug(`Parsing: ${this.lastMetrics.parseTimeMs.toFixed(2)}ms`);
    this.logger.debug(`Syntax Transform: ${this.lastMetrics.syntaxTransformTimeMs.toFixed(2)}ms`);
    this.logger.debug(`Import Processing: ${this.lastMetrics.importProcessingTimeMs.toFixed(2)}ms`);
    this.logger.debug(`Macro Expansion: ${this.lastMetrics.macroExpansionTimeMs.toFixed(2)}ms`);
    this.logger.debug(`AST Conversion: ${this.lastMetrics.astConversionTimeMs.toFixed(2)}ms`);
    this.logger.debug(`Code Generation: ${this.lastMetrics.codeGenerationTimeMs.toFixed(2)}ms`);
    this.logger.debug(`Evaluation: ${this.lastMetrics.evaluationTimeMs.toFixed(2)}ms`);
    this.logger.debug(`Total: ${this.lastMetrics.totalTimeMs.toFixed(2)}ms`);
  }
  
  /**
   * Clear the parse cache for memory management
   */
  clearCache(): void {
    this.parseCache.clear();
    this.logger.debug("Parse cache cleared");
  }
  
  /**
   * Remove runtime function declarations from code to avoid redefinition errors
   */
  private removeRuntimeFunctions(code: string): string {
    // Cache the function names for efficiency
    if (!this.runtimeFunctionNames) {
      this.runtimeFunctionNames = this.extractRuntimeFunctionNames();
    }
    
    // For each runtime function, remove its function declaration
    let cleanedCode = code;
    for (const funcName of this.runtimeFunctionNames) {
      // Use a more specific regex that doesn't break other functions
      const funcRegex = new RegExp(`function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\}`, 'g');
      cleanedCode = cleanedCode.replace(funcRegex, '');
    }
    
    return cleanedCode.trim();
  }
  
  /**
   * Extract function names from runtime code - cached for performance
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
   * Evaluate JavaScript code with environment context
   */
  private async evaluateJs(code: string): Promise<Value> {
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
          // Enhanced error handling
          if (error instanceof Error) {
            // Add line number information if available
            if (error.stack) {
              const lineMatch = error.stack.match(/at eval.*<anonymous>:(\\d+):(\\d+)/);
              if (lineMatch && lineMatch[1] && lineMatch[2]) {
                const lineNum = lineMatch[1];
                const colNum = lineMatch[2];
                error.message = \`Error at line \${lineNum}, column \${colNum}: \${error.message}\`;
              }
            }
          }
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
   * Clear the REPL environment
   */
  resetEnvironment(): void {
    // Create a new environment with the same settings
    const oldEnv = this.replEnv.hqlEnv;
    // Create a new environment using the correct constructor
    const newEnv = new Environment(null, this.logger);
    
    // Initialize with the same macros
    oldEnv.macros.forEach((macro, name) => {
      newEnv.defineMacro(name, macro);
    });
    
    // Create a new REPL environment
    this.replEnv = new REPLEnvironment(newEnv, { 
      verbose: this.logger.isVerbose 
    });
    
    // Clear caches
    this.clearCache();
    this.runtimeFunctionsInitialized = false;
    
    // Re-initialize runtime functions
    this.initializeRuntimeFunctions();
    
    this.logger.debug("REPL environment reset");
  }
} 