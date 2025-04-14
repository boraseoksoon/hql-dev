// src/repl/repl-evaluator-enhanced.ts
// Enhanced version of REPLEvaluator with better import handling

import { parse } from "@transpiler/pipeline/parser.ts";
import { transformSyntax } from "@transpiler/pipeline/syntax-transformer.ts";
import { expandMacros } from "@s-exp/macro.ts";
import { processImports } from "@core/imports.ts";
import { convertToHqlAst } from "@s-exp/macro-reader.ts";
import { transformAST } from "@core/transformer.ts";
import { REPLEnvironment } from "./repl-environment.ts";
import { Environment, Value } from "@core/environment.ts";
import { SExp } from "@s-exp/types.ts";
import { RUNTIME_FUNCTIONS } from "@transpiler/runtime/runtime.ts";
import { registerSourceFile, withErrorHandling } from "@transpiler/error/error-handling.ts";
import { report } from "@transpiler/error/errors.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { CommonUtils } from "./common-utils.ts";
import { Logger, globalLogger as logger } from "@logger/logger.ts";

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
  
  // Use source registry to leverage the common error handling
  private sourceRegistry = new Map<string, string>();
  
  constructor(env: Environment, options: REPLEvalOptions = {}) {
    this.replEnv = new REPLEnvironment(env, { verbose: options.verbose });
    this.logger = logger;
    this.logger.setEnabled(!!options.verbose);
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
      this.logger.error(`Failed to initialize runtime functions: ${CommonUtils.formatErrorMessage(error)}`);
      throw error;
    }
  }
  
  /**
   * Parse a single line of input
   * Uses caching to avoid re-parsing identical input
   */
  async parseLine(input: string): Promise<SExp[]> {
    // Check cache first for better performance
    if (this.parseCache.has(input)) {
      return this.parseCache.get(input)!;
    }
    
    // Register the input source for error enhancement
    registerSourceFile("REPL", input);
    
    // Use shared error handling mechanism
    return await withErrorHandling(
      () => {
        try {
          const result = parse(input);
          // Cache the result for future use
          this.parseCache.set(input, result);
          return result;
        } catch (error) {
          this.logger.error(`Parse error: ${CommonUtils.formatErrorMessage(error)}`);
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
        // Use the specialized import handling method
        const importResult = await this.processImportDirectly(input);
        
        // Check if import was successful
        if (importResult.success) {
          log(`Import successful: ${importResult.moduleName}`);
        } else {
          log(`Import failed: ${importResult.message}`);
        }
        
        // Calculate total time
        metrics.totalTimeMs = performance.now() - startTime;
        this.lastMetrics = metrics;
        
        // Return the import result
        return {
          value: importResult.message,
          jsCode: "// Import processed directly",
          parsedExpressions: [],
          expandedExpressions: [],
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
      const expandedSexps = await withErrorHandling(
        () => expandMacros(transformedSexps, this.replEnv.hqlEnv, {
          verbose: options.verbose,
        }),
        { source: input, filePath: "REPL", context: "REPL macro expansion" }
      )();
      metrics.macroExpansionTimeMs = performance.now() - currentTime;
      log(`Expanded to ${expandedSexps.length} expressions`);
      
      log("Converting to AST...");
      currentTime = performance.now();
      const ast = await withErrorHandling(
        () => convertToHqlAst(expandedSexps, { verbose: options.verbose }),
        { source: input, filePath: "REPL", context: "REPL AST conversion" }
      )();
      metrics.astConversionTimeMs = performance.now() - currentTime;
      log("AST conversion completed");
      
      log("Generating JavaScript...");
      currentTime = performance.now();
      const jsCode = await withErrorHandling(
        () => transformAST(ast, options.baseDir || this.baseDir, {
          verbose: options.verbose,
          replMode: true
        }),
        { source: input, filePath: "REPL", context: "REPL JS transformation" }
      )();
      metrics.codeGenerationTimeMs = performance.now() - currentTime;
      log("JavaScript generation completed");
      
      log("Cleaning up generated code...");
      const cleanedCode = this.removeRuntimeFunctions(jsCode);
      const preparedJs = this.replEnv.prepareJsForRepl(cleanedCode);
      
      log("Evaluating JavaScript...");
      currentTime = performance.now();
      const value = await withErrorHandling(
        () => this.evaluateJs(preparedJs),
        { source: preparedJs, filePath: "REPL JS", context: "REPL JS evaluation" }
      )();
      metrics.evaluationTimeMs = performance.now() - currentTime;
      log("Evaluation completed");
      
      // Reset current file in environment
      this.replEnv.hqlEnv.setCurrentFile(null);
      
      // Calculate total time
      metrics.totalTimeMs = performance.now() - startTime;
      this.lastMetrics = metrics;
      
      // Return the evaluation result
      return {
        value,
        jsCode: cleanedCode,
        parsedExpressions: sexps,
        expandedExpressions: expandedSexps,
        executionTimeMs: metrics.totalTimeMs,
      };
    } catch (error: unknown) {
      this.replEnv.hqlEnv.setCurrentFile(null);
      log(`Evaluation error: ${CommonUtils.formatErrorMessage(error)}`);
      
      if (error instanceof Error) {
        // Use the common error reporting mechanism
        const enhancedError = report(error, { 
          source: input, 
          filePath: "REPL" 
        });
        throw enhancedError;
      }
      throw error;
    }
  }

  /**
   * Remove runtime functions from the generated code
   * This prevents redefinition errors
   */
  private removeRuntimeFunctions(code: string): string {
    // If no runtime function names are cached, extract them
    if (!this.runtimeFunctionNames) {
      const functionRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
      const runtimeFunctionNames: string[] = [];
      
      let match;
      while ((match = functionRegex.exec(RUNTIME_FUNCTIONS)) !== null) {
        if (match[1]) runtimeFunctionNames.push(match[1]);
      }
      
      this.runtimeFunctionNames = runtimeFunctionNames;
      this.logger.debug(`Extracted ${runtimeFunctionNames.length} runtime function names`);
    }
    
    // Remove runtime function definitions from the code
    let cleanedCode = code;
    const runtimeFunctionNames = this.runtimeFunctionNames || [];
    
    for (const funcName of runtimeFunctionNames) {
      const funcRegex = new RegExp(`function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{[^}]*\\}`, 'g');
      cleanedCode = cleanedCode.replace(funcRegex, '');
    }
    
    return cleanedCode;
  }

  /**
   * Track an imported module for user feedback
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
    } catch (error: unknown) {
      const errorMessage = CommonUtils.formatErrorMessage(error);
      this.logger.debug(`Error tracking imported module: ${errorMessage}`);
    }
  }

  /**
   * Process an import statement directly
   * This method allows imports to be handled specially in the REPL
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
      
      // Get the imported module reference from the environment
      const importedModule = this.replEnv.hqlEnv.lookup(importInfo.moduleName);
      
      // Critical step: Save the imported module in the REPL JS environment
      // This ensures the module is accessible in future evaluations
      if (importedModule !== undefined) {
        // Register in our REPL environment
        this.replEnv.setJsValue(importInfo.moduleName, importedModule);
        
        // Create a global reference to make it accessible in the REPL
        const globalAssignCode = `globalThis.${importInfo.moduleName} = replEnv.getJsValue("${importInfo.moduleName}");`;
        await this.evaluateJs(globalAssignCode);
        
        this.logger.debug(`Registered "${importInfo.moduleName}" in REPL environment`);
      } else {
        this.logger.error(`Module "${importInfo.moduleName}" was processed but not found in environment`);
      }
      
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
    } catch (error: unknown) {
      // Use common error handling
      if (error instanceof Error) {
        const enhancedError = report(error, {
          source: input,
          filePath: "REPL Import"
        });
        
        const errorMessage = enhancedError.message || "Unknown error";
        this.logger.error(`Import error: ${errorMessage}`);
        
        return {
          success: false,
          moduleName: 'unknown',
          message: `Import failed: ${errorMessage}`
        };
      }
      
      const errorMessage = String(error);
      this.logger.error(`Import error: ${errorMessage}`);
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
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      this.logger.error(`Error extracting import info: ${errorMessage}`);
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
    
    // Handle jsr imports
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
      } catch (error: unknown) {
        return 'remote_module';
      }
    }
    
    // Regular file path
    const basename = path.basename(modulePath);
    return basename.replace(/\.[^/.]+$/, '').replace(/[-]/g, '_');
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
  getMetrics(): EvaluationMetrics | null {
    return this.lastMetrics;
  }

  /**
   * Evaluate JavaScript code within the REPL environment
   */
  private async evaluateJs(code: string): Promise<Value> {
    try {
      // Check for function/variable redeclaration before evaluation
      const redeclarations = this.detectRedeclarations(code);
      if (redeclarations.length > 0) {
        // Log details about the redeclaration for debugging
        this.logger.debug(`Redeclaration detected: ${redeclarations.join(', ')}`);
        
        // Throw a special error for redeclarations that can be handled by the REPL
        const message = `Identifier '${redeclarations[0]}' has already been declared`;
        const error = new Error(message);
        // Add a custom property to distinguish this type of error
        (error as any).isRedeclarationError = true;
        (error as any).identifiers = redeclarations;
        throw error;
      }
      
      // Get all the variables defined in the REPL environment
      const context = this.replEnv.createEvalContext();
      
      // Create all imported modules as global variables to ensure they persist
      const importedModulesSetup = Array.from(this.importedModules.entries())
        .map(([name, _]) => {
          return `if (typeof ${name} === 'undefined' && replEnv.hasJsValue("${name}")) {
            globalThis.${name} = replEnv.getJsValue("${name}");
          }`;
        })
        .join('\n');
      
      // Wrap the code in a function that has access to the REPL environment
      // Include the setup for imported modules to ensure they're available
      const wrappedCode = `
        ${context}
        ${importedModulesSetup}
        
        ${code}
      `;
      
      // Create a function that has access to the REPL environment
      // This ensures that variables defined in the REPL environment are available
      // deno-lint-ignore no-explicit-any
      const fn = new Function(
        "replEnv",
        wrappedCode + "\n//# sourceURL=repl-eval.js"
      ) as (env: REPLEnvironment) => any;
      
      // Call the function with the REPL environment
      return await fn(this.replEnv);
    } catch (error: unknown) {
      // Format the error message
      const errorMessage = CommonUtils.formatErrorMessage(error);
      this.logger.error(`JavaScript evaluation error: ${errorMessage}`);
      
      // Check if this is a redeclaration error
      if (error instanceof Error && (error as any).isRedeclarationError) {
        throw error; // Pass it up to be handled by the REPL
      }
      
      // Rethrow the error
      if (error instanceof Error) {
        // Use common error handling
        const enhancedError = report(error, {
          source: code,
          filePath: "REPL JS"
        });
        throw enhancedError;
      }
      throw new Error(String(error));
    }
  }

  /**
   * Detect redeclarations of functions or variables in code
   * Returns an array of redeclared identifiers
   */
  private detectRedeclarations(code: string): string[] {
    const redeclaredIdentifiers: string[] = [];
    
    // Get the current module from the REPLEnvironment
    const currentModule = this.replEnv.getCurrentModule ? 
      this.replEnv.getCurrentModule() : 
      "user"; // Default fallback
    
    // Get current module symbols from the environment to check against
    const currentModuleSymbols = new Set(this.replEnv.getDefinedSymbols(currentModule));
    
    this.logger.debug(`Checking for redeclarations in module "${currentModule}"`);
    this.logger.debug(`Current module symbols: ${Array.from(currentModuleSymbols).join(', ')}`);
    
    // Extract function declarations
    const funcRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    let match;
    
    while ((match = funcRegex.exec(code)) !== null) {
      const funcName = match[1];
      // Check if symbol is actually in the current module's defined symbols list
      if (currentModuleSymbols.has(funcName)) {
        this.logger.debug(`Found function redeclaration: ${funcName}`);
        redeclaredIdentifiers.push(funcName);
      }
    }
    
    // Extract variable declarations (const, let, var)
    const varRegex = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
    while ((match = varRegex.exec(code)) !== null) {
      const varName = match[1];
      // Check if symbol is actually in the current module's defined symbols list
      if (currentModuleSymbols.has(varName)) {
        this.logger.debug(`Found variable redeclaration: ${varName}`);
        redeclaredIdentifiers.push(varName);
      }
    }
    
    // Extract HQL function declarations (fn/defn)
    // Detect HQL function declarations like (fn name (param) body)
    const hqlFuncRegex = /\(\s*(?:fn|defn)\s+([a-zA-Z_$][a-zA-Z0-9_$-]*)/g;
    while ((match = hqlFuncRegex.exec(code)) !== null) {
      const funcName = match[1];
      // Check if symbol is actually in the current module's defined symbols list
      if (currentModuleSymbols.has(funcName)) {
        this.logger.debug(`Found HQL function redeclaration: ${funcName}`);
        redeclaredIdentifiers.push(funcName);
      }
    }
    
    return redeclaredIdentifiers;
  }
  
  /**
   * Forcibly redefine a symbol, overwriting any existing definition
   */
  async forceDefine(code: string): Promise<Value> {
    return this.evaluateJs(code);
  }

  /**
   * Reset the evaluator's environment to a clean state
   * This maintains the base environment but clears all user-defined symbols
   */
  resetEnvironment(): void {
    this.logger.debug("Resetting REPL environment");
    
    // Create a fresh environment based on the global core
    // Use the extend method to create a clean child environment
    const freshEnv = this.replEnv.hqlEnv.extend();
    
    // Recreate the REPL environment with the fresh environment
    this.replEnv = new REPLEnvironment(freshEnv, { 
      verbose: this.logger.isVerbose
    });
    
    // Clear all caches
    this.importCache.clear();
    this.importedModules.clear();
    this.parseCache.clear();
    this.lastMetrics = null;
    
    // Reinitialize runtime functions
    this.runtimeFunctionsInitialized = false;
    this.initializeRuntimeFunctions();
    
    this.logger.debug("REPL environment reset complete");
  }
}