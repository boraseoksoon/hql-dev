// src/transpiler/transformer.ts - With enhanced module handling
import { HQLNode } from "./hql_ast.ts";
import { transformToIR } from "./hql-to-ir.ts";
import { convertIRToTSAST } from "./ir-to-ts-ast.ts";
import { generateTypeScript, CodeGenerationOptions } from "./ts-ast-to-code.ts";
import { join } from "jsr:@std/path@1.0.8";
import { bundleFile, bundleJSModule } from "../bundler/bundler.ts";

export interface TransformOptions {
  target?: 'javascript' | 'typescript';
  missingTypeStrategy?: 'omit' | 'any';
  propertyAccessStyle?: 'dot' | 'bracket';
  formatting?: 'minimal' | 'standard' | 'pretty';
  module?: 'commonjs' | 'esm';
  indentSize?: number;
  useSpaces?: boolean;
}

export async function transformAST(
  nodes: HQLNode[],
  currentDir: string,
  visited: Set<string>,
  options: TransformOptions = {},
  inModule: boolean = false
): Promise<string> {
  const opts: TransformOptions = {
    target: options.target ?? 'javascript',
    missingTypeStrategy: options.missingTypeStrategy ?? 'omit',
    propertyAccessStyle: options.propertyAccessStyle ?? 'dot',
    formatting: options.formatting ?? 'standard',
    module: options.module ?? 'esm',
    indentSize: options.indentSize ?? 2,
    useSpaces: options.useSpaces ?? true,
  };
  if (inModule) opts.module = 'commonjs';

  // Transform HQL to IR
  const irProgram = transformToIR(nodes, currentDir);
  
  // Transform IR to TypeScript AST
  const tsAST = convertIRToTSAST(irProgram);
  
  // Configure code generation options
  const codeOptions: CodeGenerationOptions = {
    formatting: opts.formatting,
    indentSize: opts.indentSize,
    useSpaces: opts.useSpaces,
  };
  
  // Generate JavaScript code from TypeScript AST
  let jsCode = generateTypeScript(tsAST, codeOptions);
  
  // Post-process the generated code
  jsCode = await postProcessGeneratedCode(jsCode, currentDir, visited, opts.module === 'commonjs');
  
  return jsCode;
}

/**
 * Post-process the generated JavaScript code to bundle imports.
 */
async function postProcessGeneratedCode(
  code: string,
  currentDir: string,
  visited: Set<string>,
  useCommonJS: boolean
): Promise<string> {
  // First handle any remaining HQL imports
  let processed = await processRemainingHqlImports(code, currentDir, visited);
  
  // Then handle JS imports
  processed = await processRemainingJsImports(processed, currentDir, visited);
  
  // Format exports if CommonJS is used
  if (useCommonJS) {
    processed = formatExportsForCommonJS(processed);
  }
  
  // Clean up type annotations and logical operations
  processed = cleanupTypeAnnotations(processed);
  processed = fixLogicalOperations(processed);
  
  return processed;
}

/**
 * Process any remaining HQL imports in the code.
 */
async function processRemainingHqlImports(
  code: string,
  currentDir: string,
  visited: Set<string>
): Promise<string> {
  // Use separate patterns for different import types for better matching
  const defaultImportPattern = /import\s+(\w+)\s+from\s+["']([^"']+\.hql)["'];/g;
  const namedImportPattern = /import\s+\{\s*([^}]+)\s*\}\s+from\s+["']([^"']+\.hql)["'];/g;
  const namespaceImportPattern = /import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+\.hql)["'];/g;
  
  let processed = code;
  
  // Handle named imports first
  let match;
  while ((match = namedImportPattern.exec(code)) !== null) {
    const [fullMatch, namedImports, importPath] = match;
    
    // Skip non-local imports
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;
    
    const fullPath = join(currentDir, importPath);
    
    try {
      // Bundle the HQL file
      const bundledHql = await bundleFile(fullPath, visited, true);
      
      // Parse the named imports
      const importItems = namedImports
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      const tempVar = `__hql_mod_${Math.floor(Math.random() * 10000)}`;
      
      // Create variable declarations for each named import
      const importVars = importItems.map(item => {
        const [name, alias] = item.split(/\s+as\s+/).map(s => s.trim());
        const localName = alias || name;
        return `const ${localName} = ${tempVar}.${name};`;
      });
      
      // Create replacement
      const replacement = `// Bundled HQL module from ${importPath}
const ${tempVar} = (function() {
  const exports = {};
  ${bundledHql}
  return exports;
})();
${importVars.join('\n')}`;
      
      processed = processed.replace(fullMatch, replacement);
    } catch (error) {
      console.error(`Error processing named HQL import ${importPath}:`, error);
    }
  }
  
  // Handle default imports
  while ((match = defaultImportPattern.exec(processed)) !== null) {
    const [fullMatch, importName, importPath] = match;
    
    // Skip non-local imports
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;
    
    const fullPath = join(currentDir, importPath);
    
    try {
      // Bundle the HQL file
      const bundledHql = await bundleFile(fullPath, visited, true);
      
      // Create replacement
      const replacement = `// Bundled HQL module from ${importPath}
const ${importName} = (function() {
  const exports = {};
  ${bundledHql}
  return exports;
})();`;
      
      processed = processed.replace(fullMatch, replacement);
    } catch (error) {
      console.error(`Error processing default HQL import ${importPath}:`, error);
    }
  }
  
  // Handle namespace imports
  while ((match = namespaceImportPattern.exec(processed)) !== null) {
    const [fullMatch, namespaceName, importPath] = match;
    
    // Skip non-local imports
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;
    
    const fullPath = join(currentDir, importPath);
    
    try {
      // Bundle the HQL file
      const bundledHql = await bundleFile(fullPath, visited, true);
      
      // Create replacement
      const replacement = `// Bundled HQL module from ${importPath}
const ${namespaceName} = (function() {
  const exports = {};
  ${bundledHql}
  return exports;
})();`;
      
      processed = processed.replace(fullMatch, replacement);
    } catch (error) {
      console.error(`Error processing namespace HQL import ${importPath}:`, error);
    }
  }
  
  return processed;
}

/**
 * Process any remaining JS imports in the code.
 */
async function processRemainingJsImports(
  code: string,
  currentDir: string,
  visited: Set<string>
): Promise<string> {
  // Use separate patterns for different import types
  const defaultImportPattern = /import\s+(\w+)\s+from\s+["']([^"']+\.js)["'];/g;
  const namedImportPattern = /import\s+\{\s*([^}]+)\s*\}\s+from\s+["']([^"']+\.js)["'];/g;
  const namespaceImportPattern = /import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+\.js)["'];/g;
  
  let processed = code;
  
  // Handle named imports first
  let match;
  while ((match = namedImportPattern.exec(code)) !== null) {
    const [fullMatch, namedImports, importPath] = match;
    
    // Skip non-local imports
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;
    
    const fullPath = join(currentDir, importPath);
    
    try {
      // Read and bundle the JS file
      const jsContent = await bundleJSModule(fullPath, visited);
      
      // Parse the named imports
      const importItems = namedImports
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      const tempVar = `__js_mod_${Math.floor(Math.random() * 10000)}`;
      
      // Create variable declarations for each named import
      const importVars = importItems.map(item => {
        const [name, alias] = item.split(/\s+as\s+/).map(s => s.trim());
        const localName = alias || name;
        return `const ${localName} = ${tempVar}.${name};`;
      });
      
      // Replace the import
      const replacement = `// Bundled JS module from ${importPath}
const ${tempVar} = (function() {
  const exports = {};
  ${jsContent}
  return exports;
})();
${importVars.join('\n')}`;
      
      processed = processed.replace(fullMatch, replacement);
    } catch (error) {
      console.error(`Error processing named JS import ${importPath}:`, error);
    }
  }
  
  // Handle default imports
  while ((match = defaultImportPattern.exec(processed)) !== null) {
    const [fullMatch, importName, importPath] = match;
    
    // Skip non-local imports
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;
    
    const fullPath = join(currentDir, importPath);
    
    try {
      // Read and bundle the JS file
      const jsContent = await bundleJSModule(fullPath, visited);
      
      // Replace the import
      const replacement = `// Bundled JS module from ${importPath}
const ${importName} = (function() {
  const exports = {};
  ${jsContent}
  return exports;
})();`;
      
      processed = processed.replace(fullMatch, replacement);
    } catch (error) {
      console.error(`Error processing default JS import ${importPath}:`, error);
    }
  }
  
  // Handle namespace imports
  while ((match = namespaceImportPattern.exec(processed)) !== null) {
    const [fullMatch, namespaceName, importPath] = match;
    
    // Skip non-local imports
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;
    
    const fullPath = join(currentDir, importPath);
    
    try {
      // Read and bundle the JS file
      const jsContent = await bundleJSModule(fullPath, visited);
      
      // Replace the import
      const replacement = `// Bundled JS module from ${importPath}
const ${namespaceName} = (function() {
  const exports = {};
  ${jsContent}
  return exports;
})();`;
      
      processed = processed.replace(fullMatch, replacement);
    } catch (error) {
      console.error(`Error processing namespace JS import ${importPath}:`, error);
    }
  }
  
  return processed;
}

/**
 * Clean up type annotations in the generated code.
 */
function cleanupTypeAnnotations(code: string): string {
  // Remove leftover type hints like "->(Number)"
  return code.replace(/->\([^)]*\)/g, "");
}

/**
 * Fix logical operations in the generated code.
 */
function fixLogicalOperations(code: string): string {
  let processed = code;
  
  // Fix not() function calls that weren't properly transformed
  const notPattern = /not\(([^)]+)\)/g;
  processed = processed.replace(notPattern, '!($1)');
  
  // Fix equals function calls that weren't properly transformed
  const equalsPattern = /=\(([^,]+),\s*([^)]+)\)/g;
  processed = processed.replace(equalsPattern, '($1 === $2)');
  
  return processed;
}

/**
 * Format exports for CommonJS.
 */
function formatExportsForCommonJS(code: string): string {
  return code.replace(/export\s*\{\s*([^}]+)\s*\};/g, (match, list: string) => {
    const items = list.split(",").map(s => s.trim());
    return items.map(item => {
      if (item.includes(" as ")) {
        const [local, exported] = item.split(" as ").map(s => s.trim());
        return `exports.${exported} = ${local};`;
      }
      return `exports.${item} = ${item};`;
    }).join("\n");
  });
}