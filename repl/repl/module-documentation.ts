// src/repl/module-documentation.ts
// Module documentation and dependency tracking

import { ModuleAwareEvaluator } from "./module-aware-evaluator.ts";

/**
 * Module Dependencies Tracker
 * Manages module dependencies and provides quick import suggestions
 */
export class ModuleDependencyTracker {
  private evaluator: ModuleAwareEvaluator;
  private dependencies: Map<string, Set<string>> = new Map();
  private dependents: Map<string, Set<string>> = new Map();
  private moduleDescriptions: Map<string, string> = new Map();
  
  constructor(evaluator: ModuleAwareEvaluator) {
    this.evaluator = evaluator;
  }
  
  /**
   * Register a dependency between modules
   */
  addDependency(fromModule: string, toModule: string): void {
    // Get or create the dependencies set for the fromModule
    if (!this.dependencies.has(fromModule)) {
      this.dependencies.set(fromModule, new Set());
    }
    this.dependencies.get(fromModule)!.add(toModule);
    
    // Get or create the dependents set for the toModule
    if (!this.dependents.has(toModule)) {
      this.dependents.set(toModule, new Set());
    }
    this.dependents.get(toModule)!.add(fromModule);
  }
  
  /**
   * Remove a dependency between modules
   */
  removeDependency(fromModule: string, toModule: string): void {
    if (this.dependencies.has(fromModule)) {
      this.dependencies.get(fromModule)!.delete(toModule);
    }
    
    if (this.dependents.has(toModule)) {
      this.dependents.get(toModule)!.delete(fromModule);
    }
  }
  
  /**
   * Get all modules that the given module depends on
   */
  getDependencies(moduleName: string): string[] {
    return Array.from(this.dependencies.get(moduleName) || []);
  }
  
  /**
   * Get all modules that depend on the given module
   */
  getDependents(moduleName: string): string[] {
    return Array.from(this.dependents.get(moduleName) || []);
  }
  
  /**
   * Set a description for a module
   */
  setModuleDescription(moduleName: string, description: string): void {
    this.moduleDescriptions.set(moduleName, description);
  }
  
  /**
   * Get the description for a module
   */
  getModuleDescription(moduleName: string): string {
    return this.moduleDescriptions.get(moduleName) || "No description available";
  }
  
  /**
   * Check if a change to a module would break dependents
   */
  async checkForBreakingChanges(moduleName: string, removedSymbols: string[]): Promise<Map<string, string[]>> {
    const dependents = this.getDependents(moduleName);
    const breakingChanges = new Map<string, string[]>();
    
    for (const dependent of dependents) {
      const affectedSymbols: string[] = [];
      
      // Check each symbol being removed to see if it's imported by the dependent
      for (const symbol of removedSymbols) {
        const isImported = await this.isSymbolImportedBy(symbol, moduleName, dependent);
        if (isImported) {
          affectedSymbols.push(symbol);
        }
      }
      
      if (affectedSymbols.length > 0) {
        breakingChanges.set(dependent, affectedSymbols);
      }
    }
    
    return breakingChanges;
  }
  
  /**
   * Check if a specific symbol is imported by another module
   */
  private async isSymbolImportedBy(symbolName: string, fromModule: string, toModule: string): Promise<boolean> {
    // This implementation will depend on how imports are tracked in your system
    // For now, return false to avoid breaking anything
    return false;
  }
  
  /**
   * Generate import suggestions based on what's being used
   */
  async generateImportSuggestions(code: string, currentModule: string): Promise<Map<string, string[]>> {
    const suggestions = new Map<string, string[]>();
    
    // Extract symbols used in the code
    const symbols = this.extractSymbolsFromCode(code);
    
    // For each symbol, check if it exists in other modules
    for (const symbol of symbols) {
      const modulesWithSymbol = await this.findModulesWithSymbol(symbol, currentModule);
      
      for (const module of modulesWithSymbol) {
        if (!suggestions.has(module)) {
          suggestions.set(module, []);
        }
        suggestions.get(module)!.push(symbol);
      }
    }
    
    return suggestions;
  }
  
  /**
   * Extract symbol references from code
   */
  private extractSymbolsFromCode(code: string): string[] {
    // This is a simple implementation - a more robust one would parse the code
    const symbolRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$-]*\b/g;
    const matches = code.match(symbolRegex) || [];
    
    // Filter out duplicates and keywords
    const keywords = ["def", "defn", "fn", "if", "let", "do", "when", "while", "loop", 
                     "for", "import", "export", "module", "true", "false", "nil"];
    
    return [...new Set(matches)].filter(symbol => !keywords.includes(symbol));
  }
  
  /**
   * Find all modules that contain a given symbol
   */
  private async findModulesWithSymbol(symbolName: string, currentModule: string): Promise<string[]> {
    const modules = await this.evaluator.getAvailableModules();
    const result: string[] = [];
    
    for (const module of modules) {
      if (module === currentModule) continue;
      
      const symbols = await this.evaluator.listModuleSymbols(module);
      if (symbols.includes(symbolName)) {
        result.push(module);
      }
    }
    
    return result;
  }
}

/**
 * Documentation Manager
 * Provides access to documentation for HQL functions and modules
 */
export class DocumentationManager {
  private evaluator: ModuleAwareEvaluator;
  private functionDocs: Map<string, string> = new Map();
  private builtinDocs: Map<string, string> = new Map();
  
  constructor(evaluator: ModuleAwareEvaluator) {
    this.evaluator = evaluator;
    this.initializeBuiltinDocs();
  }
  
  /**
   * Set documentation for a function
   */
  setFunctionDocumentation(moduleName: string, functionName: string, docString: string): void {
    const key = `${moduleName}:${functionName}`;
    this.functionDocs.set(key, docString);
  }
  
  /**
   * Get documentation for a function
   */
  getFunctionDocumentation(moduleName: string, functionName: string): string | undefined {
    const key = `${moduleName}:${functionName}`;
    return this.functionDocs.get(key) || this.builtinDocs.get(functionName);
  }
  
  /**
   * Extract docstring from function definition
   */
  extractDocstring(functionCode: string): string {
    // Match docstring comments at the start of a function or after the function name and args
    const docCommentRegex = /;;\s*(.+)$/gm;
    const docStrings: string[] = [];
    
    let match;
    while ((match = docCommentRegex.exec(functionCode)) !== null) {
      docStrings.push(match[1]);
    }
    
    return docStrings.join('\n');
  }
  
  /**
   * Initialize built-in function documentation
   */
  private initializeBuiltinDocs(): void {
    // Basic arithmetic functions
    this.builtinDocs.set("+", "Adds numbers or concatenates strings/lists.\nUsage: (+ x y z ...)");
    this.builtinDocs.set("-", "Subtracts numbers.\nUsage: (- x y z ...) or (- x) for negation");
    this.builtinDocs.set("*", "Multiplies numbers.\nUsage: (* x y z ...)");
    this.builtinDocs.set("/", "Divides numbers.\nUsage: (/ x y z ...)");
    
    // Comparison functions
    this.builtinDocs.set("=", "Tests if values are equal.\nUsage: (= x y z ...)");
    this.builtinDocs.set("<", "Tests if values are in ascending order.\nUsage: (< x y z ...)");
    this.builtinDocs.set(">", "Tests if values are in descending order.\nUsage: (> x y z ...)");
    this.builtinDocs.set("<=", "Tests if values are in non-descending order.\nUsage: (<= x y z ...)");
    this.builtinDocs.set(">=", "Tests if values are in non-ascending order.\nUsage: (>= x y z ...)");
    
    // Logic functions
    this.builtinDocs.set("and", "Logical AND operation.\nUsage: (and expr1 expr2 ...)");
    this.builtinDocs.set("or", "Logical OR operation.\nUsage: (or expr1 expr2 ...)");
    this.builtinDocs.set("not", "Logical NOT operation.\nUsage: (not expr)");
    
    // Control flow
    this.builtinDocs.set("if", "Conditional expression.\nUsage: (if condition then-expr else-expr)");
    this.builtinDocs.set("when", "Executes body when condition is true.\nUsage: (when condition body ...)");
    this.builtinDocs.set("cond", "Multi-way conditional.\nUsage: (cond [test1 expr1] [test2 expr2] ...)");
    this.builtinDocs.set("do", "Evaluates expressions in sequence.\nUsage: (do expr1 expr2 ...)");
    
    // Definitions
    this.builtinDocs.set("def", "Defines a global variable.\nUsage: (def name value)");
    this.builtinDocs.set("fn", "Defines a function.\nUsage: (fn name [params] body)");
    this.builtinDocs.set("defn", "Shorthand to define a named function.\nUsage: (defn name [params] body)");
    this.builtinDocs.set("let", "Creates local bindings.\nUsage: (let [name1 val1, name2 val2] body ...)");
    
    // Sequence functions
    this.builtinDocs.set("map", "Applies function to items in collection.\nUsage: (map f coll)");
    this.builtinDocs.set("filter", "Filters collection by predicate.\nUsage: (filter pred coll)");
    this.builtinDocs.set("reduce", "Combines collection elements with a function.\nUsage: (reduce f init coll)");
    
    // Module system
    this.builtinDocs.set("import", "Imports symbols from modules.\nUsage: (import [symbol1, symbol2] from \"module\")");
    this.builtinDocs.set("export", "Exports symbols from current module.\nUsage: (export [symbol1, symbol2])");
    
    // Data structure operations
    this.builtinDocs.set("get", "Gets value at key/index.\nUsage: (get collection key-or-index)");
    this.builtinDocs.set("contains?", "Tests if collection contains value.\nUsage: (contains? collection value)");
    this.builtinDocs.set("nth", "Gets value at index.\nUsage: (nth collection index)");
    this.builtinDocs.set("first", "Gets first item in collection.\nUsage: (first collection)");
    this.builtinDocs.set("rest", "Gets all but first item.\nUsage: (rest collection)");
    this.builtinDocs.set("cons", "Prepends item to collection.\nUsage: (cons item collection)");
    
    // Type inspection
    this.builtinDocs.set("type", "Returns type of value.\nUsage: (type value)");
    this.builtinDocs.set("str", "Converts values to string.\nUsage: (str val1 val2 ...)");
    this.builtinDocs.set("name", "Gets name of symbol or keyword.\nUsage: (name symbol-or-keyword)");
  }
  
  /**
   * Get documentation for a built-in HQL function
   */
  getBuiltinDocumentation(funcName: string): string | undefined {
    return this.builtinDocs.get(funcName);
  }
  
  /**
   * Display context-sensitive help for the current code
   */
  async getContextSensitiveHelp(code: string, position: number): Promise<string | undefined> {
    // Extract the symbol at the current position
    const symbolAtCursor = this.extractSymbolAtPosition(code, position);
    if (!symbolAtCursor) return undefined;
    
    // Try to find documentation for the symbol
    const currentModule = this.evaluator.getCurrentModuleSync();
    
    // First check if it's a built-in function
    const builtinDoc = this.getBuiltinDocumentation(symbolAtCursor);
    if (builtinDoc) return builtinDoc;
    
    // Then check user-defined functions
    const modules = await this.evaluator.getAvailableModules();
    
    // First check the current module
    const currentModuleDoc = this.getFunctionDocumentation(currentModule, symbolAtCursor);
    if (currentModuleDoc) return currentModuleDoc;
    
    // Then check other modules
    for (const module of modules) {
      if (module === currentModule) continue;
      
      const symbols = await this.evaluator.listModuleSymbols(module);
      if (symbols.includes(symbolAtCursor)) {
        const doc = this.getFunctionDocumentation(module, symbolAtCursor);
        if (doc) return `From module '${module}':\n${doc}`;
        
        // If no explicit doc is found, return a basic message that the symbol exists in this module
        return `Symbol '${symbolAtCursor}' exists in module '${module}'.\nUse (import [${symbolAtCursor}] from "${module}") to import it.`;
      }
    }
    
    return undefined;
  }
  
  /**
   * Extract the symbol at the current cursor position
   */
  private extractSymbolAtPosition(code: string, position: number): string | undefined {
    // Simple extraction: find word boundaries around position
    const beforeCursor = code.substring(0, position);
    const afterCursor = code.substring(position);
    
    const beforeMatch = beforeCursor.match(/[a-zA-Z0-9_$-]*$/);
    const afterMatch = afterCursor.match(/^[a-zA-Z0-9_$-]*/);
    
    if (!beforeMatch) return undefined;
    
    const symbol = beforeMatch[0] + (afterMatch ? afterMatch[0] : "");
    return symbol.length > 0 ? symbol : undefined;
  }
  
  /**
   * Generate documentation for a module based on its symbols
   */
  async generateModuleDocumentation(moduleName: string, dependencyTracker?: ModuleDependencyTracker): Promise<string> {
    const symbols = await this.evaluator.listModuleSymbols(moduleName);
    const exports = await this.evaluator.getModuleExports(moduleName);
    
    let documentation = `# Module: ${moduleName}\n\n`;
    
    // Add module description if available
    let moduleDescription = "No description available";
    if (dependencyTracker) {
      moduleDescription = dependencyTracker.getModuleDescription(moduleName);
    }
    
    documentation += `${moduleDescription}\n\n`;
    
    // Add dependency information if available
    if (dependencyTracker) {
      const dependencies = dependencyTracker.getDependencies(moduleName);
      const dependents = dependencyTracker.getDependents(moduleName);
      
      if (dependencies.length > 0) {
        documentation += `## Dependencies\n\nThis module depends on: ${dependencies.join(", ")}\n\n`;
      }
      
      if (dependents.length > 0) {
        documentation += `## Used By\n\nThis module is used by: ${dependents.join(", ")}\n\n`;
      }
    }
    
    // List exported symbols
    if (exports.length > 0) {
      documentation += "## Exported Symbols\n\n";
      
      for (const sym of exports) {
        const doc = this.getFunctionDocumentation(moduleName, sym) || "No documentation available";
        documentation += `### ${sym}\n\n${doc}\n\n`;
      }
    }
    
    // List other symbols
    const otherSymbols = symbols.filter(s => !exports.includes(s));
    if (otherSymbols.length > 0) {
      documentation += "## Internal Symbols\n\n";
      
      for (const sym of otherSymbols) {
        const doc = this.getFunctionDocumentation(moduleName, sym) || "No documentation available";
        documentation += `### ${sym}\n\n${doc}\n\n`;
      }
    }
    
    return documentation;
  }
} 