import { HQLNode, ListNode, SymbolNode, LiteralNode, isImportNode, isMacroDefinition, isDefDefinition, isJsExport } from "./transpiler/hql_ast.ts";
import { Env } from "./environment.ts";
import { evaluateSExp } from "./s-expression-evaluator.ts";
import { convertToComplexAST } from "./s-expression-to-ast.ts";
import { dirname, resolve, readTextFile } from "./platform/platform.ts";
import { parse } from "./transpiler/parser.ts";
import { Logger } from "./logger.ts";
import { makeSymbol, makeLiteral, makeList } from "./bootstrap.ts";

// Registry for tracking imported modules and their sources
export const moduleRegistry = new Map<string, string>();

// Options for macro expansion
export interface MacroExpanderOptions {
  verbose?: boolean;
  baseDir?: string;
}

/**
 * Process an import statement
 */
export async function processImportNode(
  importNode: ListNode,
  env: Env,
  currentDir: string,
  logger: Logger = new Logger()
): Promise<void> {
  if (importNode.elements.length < 3) {
    throw new Error("Import requires a name and a path");
  }
  
  const nameNode = importNode.elements[1];
  const pathNode = importNode.elements[2];
  
  if (nameNode.type !== "symbol") {
    throw new Error("Import name must be a symbol");
  }
  const importName = (nameNode as SymbolNode).name;
  
  if (pathNode.type !== "literal") {
    throw new Error("Import path must be a string literal");
  }
  const rawImportPath = String((pathNode as LiteralNode).value);
  
  // Resolve relative paths against currentDir
  let importPath = rawImportPath;
  if (rawImportPath.startsWith("./") || rawImportPath.startsWith("../")) {
    importPath = resolve(currentDir, rawImportPath);
    logger.debug(`Resolved import path: ${rawImportPath} -> ${importPath}`);
  }
  
  logger.debug(`Processing import: ${importName} from ${importPath}`);
  
  // Register the import in our global registry with resolved path
  moduleRegistry.set(importName, importPath);

  // Process HQL imports
  if (importPath.endsWith('.hql')) {
    try {
      await processHqlImport(importName, importPath, env, currentDir, new Set(), logger);
    } catch (error) {
      logger.error(`Error processing import ${importPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (importPath.endsWith('.js')) {
    // Process JS imports
    try {
      await processJsImport(importName, importPath, env, logger);
    } catch (error) {
      logger.error(`Error processing JS import ${importPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Process a JavaScript import
 */
/**
 * Process a JavaScript import
 */
async function processJsImport(
  moduleName: string,
  modulePath: string,
  env: Env,
  logger: Logger
): Promise<void> {
  logger.debug(`Importing JS module: ${moduleName} from ${modulePath}`);
  
  try {
    // Check for circular dependencies with HQL files first
    const jsToHqlPath = modulePath.replace(/\.js$/, '.hql');
    
    // Try to preprocess HQL dependency first if it exists
    try {
      const stat = await Deno.stat(jsToHqlPath);
      if (stat.isFile) {
        logger.debug(`Found HQL equivalent: ${jsToHqlPath}`);
        // Process the HQL file first to avoid circular dependencies
        await processHqlImport(moduleName, jsToHqlPath, env, dirname(modulePath), new Set(), logger);
      }
    } catch (error) {
      // No HQL file found, continue with JS import
      logger.debug(`No HQL equivalent found for ${modulePath}`);
    }
    
    // First try normal import
    try {
      // Dynamic import of JavaScript module
      const jsModule = await import(modulePath);
      
      // Create a safe copy of the module to avoid reference issues
      const safeCopy: Record<string, any> = {};
      
      // Copy all properties
      for (const key of Object.keys(jsModule)) {
        try {
          safeCopy[key] = jsModule[key];
        } catch (err) {
          logger.error(`Could not copy property ${key} from module ${moduleName}`);
        }
      }
      
      // Handle default export
      if ('default' in jsModule) {
        try {
          if (typeof jsModule.default === 'object') {
            // Copy properties from default export
            for (const key of Object.keys(jsModule.default)) {
              if (!(key in safeCopy)) {
                safeCopy[key] = jsModule.default[key];
              }
            }
          }
        } catch (err) {
          logger.error(`Could not process default export from module ${moduleName}`);
        }
      }
      
      // Register the module in the environment
      env.define(moduleName, safeCopy);
      logger.debug(`Successfully imported JS module ${moduleName}`);
    } catch (error) {
      logger.error(`Failed to import JS module ${modulePath}: ${error instanceof Error ? error.message : String(error)}`);
      
      // Provide fallback empty module to prevent further errors
      env.define(moduleName, {});
    }
  } catch (finalError) {
    logger.error(`Critical error during JS import: ${finalError instanceof Error ? finalError.message : String(finalError)}`);
    // Register empty module as fallback
    env.define(moduleName, {});
  }
}

/**
 * Process an HQL file import
 */
// in src/macro-expander.ts
export async function processHqlImport(
  moduleName: string,
  modulePath: string,
  env: Env,
  currentDir: string,
  processedPaths: Set<string> = new Set(),
  logger: Logger = new Logger()
): Promise<void> {
  try {
    // Resolve path relative to current directory
    const resolvedPath = resolve(currentDir, modulePath);
    logger.debug(`Resolved import path: ${resolvedPath}`);
    
    // Skip if already processed to avoid circular dependencies
    if (processedPaths.has(resolvedPath)) {
      logger.debug(`Skipping already processed: ${resolvedPath}`);
      return;
    }
    processedPaths.add(resolvedPath);
    
    // Read and parse file
    const source = await readTextFile(resolvedPath);
    const importedAst = parse(source);
    
    // Create module object to store exports
    const moduleExports: Record<string, any> = {};
    
    // Process nested imports first
    for (const node of importedAst) {
      if (isImportNode(node)) {
        await processImportNode(node as ListNode, env, dirname(resolvedPath), logger);
      }
    }
    
    // First pass: Process macro definitions
    for (const node of importedAst) {
      if (isMacroDefinition(node)) {
        try {
          evaluateSExp(node, env, logger);
        } catch (error) {
          logger.error(`Error evaluating macro: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    
    // Second pass: Process variable definitions
    for (const node of importedAst) {
      // Skip imports and macros, already processed
      if (isImportNode(node) || isMacroDefinition(node)) {
        continue;
      }
      
      if (isDefDefinition(node)) {
        try {
          evaluateSExp(node, env, logger);
          
          // Extract the name
          const defName = (node as ListNode).elements[1] as SymbolNode;
          
          try {
            // Store in module exports
            moduleExports[defName.name] = env.lookup(defName.name);
            
            // Register with qualified name
            const qualifiedName = `${moduleName}.${defName.name}`;
            env.define(qualifiedName, env.lookup(defName.name));
            logger.debug(`Registered qualified definition: ${qualifiedName}`);
          } catch (error) {
            logger.error(`Error registering def ${defName.name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        } catch (error) {
          logger.error(`Error evaluating def: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    
    // Third pass: Process exports - add macros to module exports
    for (const name of env.macros.keys()) {
      // Add only macros defined in this module (not qualified names)
      if (!name.includes('.') && env.hasMacro(name)) {
        moduleExports[name] = env.getMacro(name);
        
        // Register with qualified name
        const qualifiedName = `${moduleName}.${name}`;
        if (!env.hasMacro(qualifiedName)) {
          env.defineMacro(qualifiedName, env.getMacro(name)!);
          logger.debug(`Registered qualified macro: ${qualifiedName}`);
        }
      }
    }
    
    // Register the module
    env.define(moduleName, moduleExports);
    logger.debug(`Registered module ${moduleName} with exports: ${Object.keys(moduleExports).join(', ')}`);
  } catch (error) {
    logger.error(`Error processing HQL import ${modulePath}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Preprocess HQL imports
 */
async function preloadMacroImports(
  nodes: HQLNode[],
  env: Env,
  baseDir: string = Deno.cwd(),
  logger: Logger = new Logger()
): Promise<void> {
  logger.debug(`Processing imports from ${baseDir}`);
  
  // Process each import node
  for (const node of nodes) {
    if (isImportNode(node)) {
      await processImportNode(node as ListNode, env, baseDir, logger);
    }
  }
}

/**
 * Expand macros in S-expressions
 */
export async function expandMacros(
  nodes: HQLNode[],
  env?: Env,
  baseDir: string = Deno.cwd(),
  options: MacroExpanderOptions = {}
): Promise<HQLNode[]> {
  const logger = new Logger(options.verbose);
  logger.debug(`Starting macro expansion with baseDir: ${baseDir}`);
  
  // Initialize environment if not provided
  if (!env) {
    env = new Env(null, logger);
    
    // CRITICAL: Ensure list function is available in the environment
    env.define("list", function(...listArgs: any[]) {
      return { type: "list", elements: listArgs };
    });
  }
  
  // First, collect and process all imports
  const importNodes = nodes.filter(isImportNode);
  
  if (importNodes.length > 0) {
    try {
      await preloadMacroImports(importNodes, env, baseDir, logger);
      logger.debug("All imports processed successfully");
    } catch (error) {
      logger.error(`Error during import processing: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Now expand all expressions with macros
  const expanded: HQLNode[] = [];
  
  for (const node of nodes) {
    // Skip imports - they've been handled and don't produce code
    if (isImportNode(node)) {
      continue;
    }
    
    try {
      // Expand any macros in the node
      const expandedNode = await expandNode(node, env, logger);
      
      // Fix for js-export to ensure correct code generation
      if (isJsExport(expandedNode)) {
        const fixedNode = fixJsExport(expandedNode as ListNode);
        expanded.push(fixedNode);
      } else {
        expanded.push(expandedNode);
      }
    } catch (error) {
      logger.error(`Error expanding node: ${error instanceof Error ? error.message : String(error)}`);
      // Keep the original node if expansion fails
      expanded.push(node);
    }
  }
  
  // Convert expanded S-expressions back to complex AST
  return convertToComplexAST(expanded, logger);
}

/**
 * Fix js-export to ensure it generates correct code
 */
function fixJsExport(node: ListNode): HQLNode {
  // Extract name and value
  const nameNode = node.elements[1];
  const valueNode = node.elements[2];
  
  // Create a special export statement that will be properly handled by the code generator
  return makeList(
    makeSymbol("export-named-declaration"),
    makeList(
      valueNode
    ),
    nameNode
  );
}

/**
 * Expand a single node with macros
 */
async function expandNode(node: HQLNode, env: Env, logger: Logger): Promise<HQLNode> {
  if (node.type !== "list") {
    // Non-list nodes don't contain macros
    return node;
  }
  
  const list = node as ListNode;
  
  // Empty list
  if (list.elements.length === 0) {
    return list;
  }
  
  const first = list.elements[0];
  
  // If first element is a symbol, check if it's a macro
  if (first.type === "symbol") {
    const name = (first as SymbolNode).name;
    
    // Skip special forms - they're handled directly
    if (["quote", "quasiquote", "unquote", "unquote-splicing"].includes(name)) {
      return list;
    }
    
    // Handle defmacro specially - evaluate but return nothing
    if (name === "defmacro") {
      evaluateSExp(list, env, logger);
      return { type: "literal", value: null };
    }
    
    // CRITICAL: Handle export correctly - ensure it generates valid JavaScript
    if (name === "export") {
      const nameNode = list.elements[1];
      const valueNode = list.elements[2];
      
      // Expand the value first
      const expandedValue = await expandNode(valueNode, env, logger);
      
      // Return a special node that will generate proper export code
      return makeList(
        makeSymbol("export-named-declaration"),
        makeList(
          expandedValue
        ),
        nameNode
      );
    }
    
    // Check if it's a macro
    if (env.hasMacro(name)) {
      const macroFn = env.getMacro(name)!;
      
      // Expand arguments first for proper lexical scoping
      const expandedArgs: HQLNode[] = [];
      
      for (let i = 1; i < list.elements.length; i++) {
        expandedArgs.push(await expandNode(list.elements[i], env, logger));
      }
      
      try {
        // Apply the macro
        const expanded = macroFn(expandedArgs, env);
        
        // Recursively expand the result
        return await expandNode(expanded, env, logger);
      } catch (error) {
        logger.error(`Error applying macro ${name}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }
    
    // Handle dot notation (module.method)
    if (name.includes('.') && !name.startsWith('.')) {
      const [moduleName, methodName] = name.split('.');
      
      // Check if it's a qualified macro name
      const qualifiedName = `${moduleName}.${methodName}`;
      
      if (env.hasMacro(qualifiedName)) {
        const macroFn = env.getMacro(qualifiedName)!;
        
        // Expand arguments first
        const expandedArgs: HQLNode[] = [];
        
        for (let i = 1; i < list.elements.length; i++) {
          expandedArgs.push(await expandNode(list.elements[i], env, logger));
        }
        
        try {
          // Apply the macro
          const expanded = macroFn(expandedArgs, env);
          
          // Recursively expand the result
          return await expandNode(expanded, env, logger);
        } catch (error) {
          logger.error(`Error applying qualified macro ${qualifiedName}: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      }
    }
  }
  
  // Not a macro call, recursively expand all elements
  const expandedElements: HQLNode[] = [list.elements[0]];
  
  for (let i = 1; i < list.elements.length; i++) {
    expandedElements.push(await expandNode(list.elements[i], env, logger));
  }
  
  return {
    type: "list",
    elements: expandedElements
  };
}