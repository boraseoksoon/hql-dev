// src/repl/repl-evaluator-enhanced.ts
// Enhanced version of REPLEvaluator with better import handling

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
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

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
 * Enhanced REPL evaluator that maintains state between evaluations
 * and properly handles imports
 */
export class REPLEvaluator {
  private replEnv: REPLEnvironment;
  private logger: Logger;
  private baseDir: string;
  private runtimeFunctionsInitialized = false;
  private runtimeFunctionNames: string[] | null = null;
  private importCache: Map<string, any> = new Map();
  
  // Track imported modules for better user experience
  private importedModules: Map<string, string> = new Map();
  
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
 * With special handling for import statements
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
    
    // Special handling for imports - process them with existing infrastructure
    if (input.trim().startsWith("(import ")) {
      log("Detected import statement, processing with imports.ts infrastructure");
      
      // Parse the input
      currentTime = performance.now();
      const sexps = await withErrorHandling(
        () => this.parseLine(input),
        { source: input, filePath: "REPL", context: "REPL parsing" }
      )();
      metrics.parseTimeMs = performance.now() - currentTime;
      log(`Parsed ${sexps.length} expressions`);
      
      // Transform syntax
      currentTime = performance.now();
      const transformedSexps = await withErrorHandling(
        () => transformSyntax(sexps, { verbose: options.verbose }),
        { source: input, filePath: "REPL", context: "REPL syntax transformation" }
      )();
      metrics.syntaxTransformTimeMs = performance.now() - currentTime;
      log(`Transformed to ${transformedSexps.length} expressions`);
      
      // Process imports
      currentTime = performance.now();
      await withErrorHandling(
        async () => {
          await processImports(transformedSexps, this.replEnv.hqlEnv, {
            verbose: options.verbose,
            baseDir: options.baseDir || this.baseDir
          });
        },
        { source: input, filePath: "REPL", context: "REPL import processing" }
      )();
      metrics.importProcessingTimeMs = performance.now() - currentTime;
      
      // Calculate total time
      metrics.totalTimeMs = performance.now() - startTime;
      this.lastMetrics = metrics;
      
      // Reset current file in environment
      this.replEnv.hqlEnv.setCurrentFile(null);
      
      // Track imported modules
      this.trackImportedModule(input);
      
      // Return a simple result indicating success
      return {
        value: "Import successful",
        jsCode: "// Import processed directly",
        parsedExpressions: sexps,
        expandedExpressions: transformedSexps,
        executionTimeMs: metrics.totalTimeMs
      };
    }
    
    // Normal evaluation path for non-import statements
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
          baseDir: options.baseDir || this.baseDir
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
    const enhancedError = this.enhanceError(
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
 * Track imported modules for better reporting
 */
private trackImportedModule(importStatement: string): void {
  try {
    const match = importStatement.match(/\(import\s+([a-zA-Z0-9_-]+)\s+from\s+"([^"]+)"\)/);
    if (match && match.length >= 3) {
      const moduleName = match[1];
      const modulePath = match[2];
      
      if (!this.importedModules) {
        this.importedModules = new Map<string, string>();
      }
      
      this.importedModules.set(moduleName, modulePath);
      this.logger.debug(`Tracked imported module: ${moduleName} from ${modulePath}`);
    }
  } catch (error) {
    this.logger.debug(`Error tracking imported module: ${error.message}`);
  }
}

  /**
   * Add additional context to an error
   */
  private enhanceError(error: Error, context: { source: string, filePath: string }): Error {
    // Add context information to the error message
    error.message = `${error.message}\nLocation: ${context.filePath}\n\n${context.source.split('\n').map((line, i) => `${i+1} │ ${line}`).join('\n')}`;
    return error;
  }
  
// Additions to src/repl/repl-evaluator.ts
// This shows just the key method needed to add for proper import handling

/**
 * Process an import statement directly
 * This method allows imports to be handled specially in the REPL
 * Add this method to your existing REPLEvaluator class
 */
async processImportDirectly(input: string): Promise<{ success: boolean, moduleName: string, message: string }> {
  try {
    const sexps = await this.parseLine(input);
    
    if (!sexps || sexps.length === 0) {
      return { 
        success: false, 
        moduleName: 'unknown', 
        message: 'Invalid import expression' 
      };
    }
    
    // Record original current file to restore later
    const originalFile = this.replEnv.hqlEnv.getCurrentFile();
    
    // Set current file in the environment
    this.replEnv.hqlEnv.setCurrentFile(this.baseDir);
    
    // Convert sexps to transformedSexps using syntax transformer
    const transformedSexps = await transformSyntax(sexps, { verbose: this.logger.isVerbose });
    
    // Extract import information before processing
    const importInfo = this.extractImportInfo(transformedSexps[0]);
    
    if (!importInfo.moduleName || !importInfo.modulePath) {
      return { 
        success: false, 
        moduleName: importInfo.moduleName || 'unknown', 
        message: 'Invalid import statement format' 
      };
    }
    
    // Process the import directly using the imports.ts module
    await processImports(transformedSexps, this.replEnv.hqlEnv, {
      verbose: this.logger.isVerbose,
      baseDir: this.baseDir
    });
    
    // Restore the original current file
    this.replEnv.hqlEnv.setCurrentFile(originalFile);
    
    // Register this successful import in our tracking
    if (!this.importedModules) {
      this.importedModules = new Map();
    }
    this.importedModules.set(importInfo.moduleName, importInfo.modulePath);
    
    return {
      success: true,
      moduleName: importInfo.moduleName,
      message: `Successfully imported ${importInfo.moduleName} from "${importInfo.modulePath}"`
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.logger.error(`Import failed: ${errorMessage}`);
    
    return {
      success: false,
      moduleName: 'unknown',
      message: `Import failed: ${errorMessage}`
    };
  }
}

/**
 * Extract import information from an S-expression
 */
private extractImportInfo(sexp: any): { moduleName: string, modulePath: string } {
  let moduleName = '';
  let modulePath = '';
  
  try {
    if (sexp.type !== 'list' || !sexp.elements || sexp.elements.length < 2) {
      return { moduleName, modulePath };
    }
    
    // Check if this is an import expression
    if (sexp.elements[0].type !== 'symbol' || sexp.elements[0].name !== 'import') {
      return { moduleName, modulePath };
    }
    
    // Simple import: (import "path")
    if (sexp.elements.length === 2 && sexp.elements[1].type === 'literal') {
      modulePath = String(sexp.elements[1].value);
      moduleName = this.getModuleNameFromPath(modulePath);
      return { moduleName, modulePath };
    }
    
    // Namespace import: (import name from "path")
    if (sexp.elements.length === 4 && 
        sexp.elements[1].type === 'symbol' && 
        sexp.elements[2].type === 'symbol' &&
        sexp.elements[2].name === 'from' &&
        sexp.elements[3].type === 'literal') {
      
      moduleName = sexp.elements[1].name;
      modulePath = String(sexp.elements[3].value);
      return { moduleName, modulePath };
    }
    
    // Vector import: (import [symbols...] from "path")
    if (sexp.elements.length === 4 && 
        sexp.elements[1].type === 'list' &&
        sexp.elements[2].type === 'symbol' &&
        sexp.elements[2].name === 'from' &&
        sexp.elements[3].type === 'literal') {
      
      modulePath = String(sexp.elements[3].value);
      moduleName = this.getModuleNameFromPath(modulePath);
      return { moduleName, modulePath };
    }
  } catch (e) {
    this.logger.error(`Error extracting import info: ${e.message}`);
  }
  
  return { moduleName, modulePath };
}

/**
 * Get all imported modules
 */
getImportedModules(): Map<string, string> {
  return this.importedModules ? new Map(this.importedModules) : new Map();
}
  
  /**
   * Extract a module name from a path
   */
  private getModuleNameFromPath(modulePath: string): string {
    // Handle npm/jsr imports
    if (modulePath.startsWith('npm:')) {
      return modulePath.substring(4).split('/')[0].replace(/[-]/g, '_');
    }
    
    if (modulePath.startsWith('jsr:')) {
      return modulePath.substring(4).split('/')[0].replace(/[-]/g, '_');
    }
    
    // Handle http/https URLs
    if (modulePath.startsWith('http:') || modulePath.startsWith('https:')) {
      try {
        const url = new URL(modulePath);
        const pathname = url.pathname;
        const filename = pathname.split('/').pop() || 'module';
        return filename.replace(/\.[^/.]+$/, '').replace(/[-]/g, '_');
      } catch {
        return 'remote_module';
      }
    }
    
    // Regular file path
    const basename = path.basename(modulePath);
    return basename.replace(/\.[^/.]+$/, '').replace(/[-]/g, '_');
  }
  
  /**
   * Get a list of all imported modules
   */
  getImportedModules(): Map<string, string> {
    return new Map(this.importedModules);
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
    this.importCache.clear();
    this.importedModules.clear();
    this.runtimeFunctionsInitialized = false;
    
    // Re-initialize runtime functions
    this.initializeRuntimeFunctions();
    
    this.logger.debug("REPL environment reset");
  }
}