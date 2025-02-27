// src/bundler/bundler.ts
import { parse } from "../transpiler/parser.ts";
import { expandMacros } from "../macro.ts";
import { transformAST } from "../transpiler/transformer.ts";
import { dirname, join } from "https://deno.land/std@0.170.0/path/mod.ts";

/**
 * Bundle an HQL file and its dependencies into JavaScript.
 * 
 * @param filePath Path to the HQL file
 * @param visited Set of already processed files to avoid circular dependencies
 * @param inModule Whether the HQL file is being imported as a module
 * @returns The bundled JavaScript code
 */
export async function bundleFile(
  filePath: string,
  visited = new Set<string>(),
  inModule = false
): Promise<string> {
  try {
    const realPath = await Deno.realPath(filePath);
    
    // Better circular dependency handling
    if (visited.has(realPath)) {
      console.warn(`Circular dependency detected: ${filePath}`);
      // Return a module that exports stubs instead of an empty string
      return `// Circular dependency detected: ${filePath}\n` +
             `// Providing stub exports to prevent infinite recursion\n` +
             `exports.default = {}; // Stub export\n`;
    }
    
    // Create a cloned visited set to avoid polluting the parent context
    const clonedVisited = new Set<string>(visited);
    clonedVisited.add(realPath);
    
    const source = await Deno.readTextFile(realPath);
    const ast = parse(source);
    const expanded = expandMacros(ast);
    const currentDir = dirname(realPath);
    
    // Transform the AST to JavaScript with bundled imports
    const transformed = await transformAST(expanded, currentDir, clonedVisited, {
      module: inModule ? 'commonjs' : 'esm' 
    }, inModule);
    
    // Process all imports directly
    let processed = transformed;
    
    // Process HQL module references
    processed = await processHqlImports(processed, currentDir, clonedVisited);
    
    // Process JS imports
    processed = await processJsImports(processed, currentDir, clonedVisited);
    
    // Fix any logical operations
    processed = fixLogicalOperations(processed);
    
    return processed;
  } catch (error) {
    // Provide helpful error information in the bundle
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Error bundling ${filePath}:`, errorMsg);
    
    // Return JS that includes proper error reporting
    return `// Error bundling HQL file: ${filePath}\n` +
           `console.error("Error in HQL module ${filePath}: ${errorMsg.replace(/"/g, '\\"')}");\n` +
           `exports.default = { error: "Failed to load module", message: "${errorMsg.replace(/"/g, '\\"')}" };\n`;
  }
}

/**
 * Process HQL imports in a JavaScript string.
 */
async function processHqlImports(
  code: string, 
  currentDir: string, 
  visited: Set<string>
): Promise<string> {
  // Regex for IIFE placeholders for HQL modules
  const iifePattern = /const\s+(\w+)\s+=\s+\(function\(\)\s*\{\s*const\s+exports\s+=\s+\{\};\s*\/\/\s+bundled\s+HQL\s+module:\s+([\w\d./\\-]+)/g;
  
  let processed = code;
  let match;
  
  // Process all HQL module placeholders
  while ((match = iifePattern.exec(code)) !== null) {
    const [prefix, importVar, importPath] = match;
    const fullPath = join(currentDir, importPath);
    
    try {
      // Find the full IIFE to replace
      const iifeTail = /return\s+exports;\s*\}\)\(\);/g;
      const fullPattern = new RegExp(`${escapeRegExp(prefix)}[\\s\\S]*?return\\s+exports;\\s*\\}\\)\\(\\);`);
      const fullMatch = fullPattern.exec(processed);
      
      if (fullMatch) {
        // Bundle the HQL module
        const bundledHql = await bundleFile(fullPath, visited, true);
        
        // Create the complete IIFE with the bundled code
        const replacement = `const ${importVar} = (function() {\n  const exports = {};\n  ${bundledHql}\n  return exports;\n})();`;
        
        // Replace the placeholder with the complete module
        processed = processed.replace(fullMatch[0], replacement);
      }
    } catch (error) {
      console.error(`Error processing HQL import ${importPath}:`, error);
    }
  }
  
  return processed;
}

/**
 * Process JS imports in a JavaScript string.
 */
async function processJsImports(
  code: string, 
  currentDir: string, 
  visited: Set<string>
): Promise<string> {
  // Regex for normal import statements for JS files
  const importPattern = /import\s+(\w+|\{\s*[^}]+\s*\}|\*\s+as\s+\w+)\s+from\s+["']([^"']+\.js)["'];/g;
  
  // Regex for nested import statements (in IIFEs)
  const nestedImportPattern = /(const\s+\w+\s+=\s+\(function\(\)\s*\{\s*const\s+exports\s+=\s+\{\};[\s\S]*?)(import\s+(\w+|\{\s*[^}]+\s*\}|\*\s+as\s+\w+)\s+from\s+["']([^"']+)["'];)([\s\S]*?return\s+exports;\s*\}\)\(\);)/g;
  
  let processed = code;
  
  // First, process nested imports (imports inside IIFEs)
  let nestedMatch;
  while ((nestedMatch = nestedImportPattern.exec(code)) !== null) {
    const [fullMatch, prefix, importStmt, importSpecifier, importPath, suffix] = nestedMatch;
    
    // Skip non-local imports
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;
    
    const fullPathToImport = join(currentDir, importPath);
    
    try {
      if (importPath.endsWith('.js')) {
        // Process JS imports inside IIFEs
        const jsContent = await Deno.readTextFile(fullPathToImport);
        
        // Process JS content to handle exports properly
        const processedContent = processJsContentForBundle(jsContent);
        
        // Handle the JS import
        const processedImport = await processImportInJs(importSpecifier, importPath, processedContent, dirname(fullPathToImport), visited);
        const replacement = `${prefix}${processedImport}${suffix}`;
        processed = processed.replace(fullMatch, replacement);
      } 
      else if (importPath.endsWith('.hql')) {
        // Process HQL imports inside IIFEs
        const processedImport = await processHqlImportInJs(importSpecifier, importPath, fullPathToImport, visited);
        const replacement = `${prefix}${processedImport}${suffix}`;
        processed = processed.replace(fullMatch, replacement);
      }
    } catch (error) {
      console.error(`Error processing nested import ${importPath}:`, error);
    }
  }
  
  // Now process top-level imports
  let match;
  while ((match = importPattern.exec(processed)) !== null) {
    const [fullMatch, importSpecifier, importPath] = match;
    
    // Skip non-local imports
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;
    
    const fullPathToImport = join(currentDir, importPath);
    
    try {
      // Read and process the JS file
      const jsContent = await Deno.readTextFile(fullPathToImport);
      
      // Process JS content to handle exports properly
      const processedContent = processJsContentForBundle(jsContent);
      
      // Bundle the JS with its dependencies
      const bundledJs = await bundleJsContent(processedContent, dirname(fullPathToImport), visited);
      
      // Replace with IIFE
      const replacement = `// Bundled JS module from ${importPath}
const ${getModuleVarName(importSpecifier)} = (function() {
  const exports = {};
  ${bundledJs}
  return exports;
})();`;
      
      processed = processed.replace(fullMatch, replacement);
    } catch (error) {
      console.error(`Error processing JS import ${importPath}:`, error);
    }
  }
  
  return processed;
}

/**
 * Process an HQL import inside a JS file
 */
async function processHqlImportInJs(
  importSpecifier: string,
  importPath: string,
  fullPath: string,
  visited: Set<string>
): Promise<string> {
  // Bundle the HQL file
  const bundledHql = await bundleFile(fullPath, visited, true);
  
  if (importSpecifier.startsWith('{')) {
    // Named imports: import { a, b as c } from "./module.hql";
    const namedImports = importSpecifier
      .replace(/^\{\s*|\s*\}$/g, '') // Remove braces
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    const tempVar = `__hql_mod_${Math.floor(Math.random() * 10000)}`;
    
    // Create variable declarations for each named import
    const importVars = namedImports.map(item => {
      const [name, alias] = item.split(/\s+as\s+/).map(s => s.trim());
      const localName = alias || name;
      return `const ${localName} = ${tempVar}.${name};`;
    });
    
    // Replace the import
    return `// Bundled HQL module from ${importPath}
const ${tempVar} = (function() {
  const exports = {};
  ${bundledHql}
  return exports;
})();
${importVars.join('\n')}`;
  } else if (importSpecifier.startsWith('*')) {
    // Namespace import: import * as mod from "./module.hql";
    const namespaceVar = importSpecifier.replace(/^\*\s+as\s+/, '');
    
    // Replace the import
    return `// Bundled HQL module from ${importPath}
const ${namespaceVar} = (function() {
  const exports = {};
  ${bundledHql}
  return exports;
})();`;
  } else {
    // Default import: import mod from "./module.hql";
    
    // Replace the import
    return `// Bundled HQL module from ${importPath}
const ${importSpecifier} = (function() {
  const exports = {};
  ${bundledHql}
  return exports;
})();`;
  }
}

/**
 * Process a JS import inside another JS file
 */
async function processImportInJs(
  importSpecifier: string,
  importPath: string,
  jsContent: string,
  currentDir: string,
  visited: Set<string>
): Promise<string> {
  // Process the JS content to handle its own imports
  const bundledJs = await bundleJsContent(jsContent, currentDir, visited);
  
  if (importSpecifier.startsWith('{')) {
    // Named imports: import { a, b as c } from "./module.js";
    const namedImports = importSpecifier
      .replace(/^\{\s*|\s*\}$/g, '') // Remove braces
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    const tempVar = `__js_mod_${Math.floor(Math.random() * 10000)}`;
    
    // Create variable declarations for each named import
    const importVars = namedImports.map(item => {
      const [name, alias] = item.split(/\s+as\s+/).map(s => s.trim());
      const localName = alias || name;
      return `const ${localName} = ${tempVar}.${name};`;
    });
    
    // Replace the import
    return `// Bundled JS module from ${importPath}
const ${tempVar} = (function() {
  const exports = {};
  ${bundledJs}
  return exports;
})();
${importVars.join('\n')}`;
  } else if (importSpecifier.startsWith('*')) {
    // Namespace import: import * as mod from "./module.js";
    const namespaceVar = importSpecifier.replace(/^\*\s+as\s+/, '');
    
    // Replace the import
    return `// Bundled JS module from ${importPath}
const ${namespaceVar} = (function() {
  const exports = {};
  ${bundledJs}
  return exports;
})();`;
  } else {
    // Default import: import mod from "./module.js";
    
    // Replace the import
    return `// Bundled JS module from ${importPath}
const ${importSpecifier} = (function() {
  const exports = {};
  ${bundledJs}
  return exports;
})();`;
  }
}

/**
 * Extract a module variable name from an import specifier.
 */
function getModuleVarName(importSpecifier: string): string {
  if (importSpecifier.startsWith('{')) {
    // For named imports, generate a unique name
    return `__js_mod_${Math.floor(Math.random() * 10000)}`;
  } else if (importSpecifier.startsWith('*')) {
    // For namespace imports, extract the namespace name
    return importSpecifier.replace(/^\*\s+as\s+/, '');
  } else {
    // For default imports, use the import name
    return importSpecifier.trim();
  }
}

/**
 * Bundle JS content, including processing any imports it contains.
 */
async function bundleJsContent(
  content: string,
  currentDir: string,
  visited: Set<string>
): Promise<string> {
  let processed = content;
  
  // Handle HQL imports in the JS content
  processed = await handleHqlImportsInJs(processed, currentDir, visited);
  
  // Handle JS imports in the JS content
  processed = await handleJsImportsInJs(processed, currentDir, visited);
  
  return processed;
}

/**
 * Handle HQL imports in JS content
 */
async function handleHqlImportsInJs(
  content: string,
  currentDir: string,
  visited: Set<string>
): Promise<string> {
  // Match both default and named HQL imports
  const hqlImportPattern = /import\s+(\w+|\{\s*[^}]+\s*\}|\*\s+as\s+\w+)\s+from\s+["']([^"']+\.hql)["'];/g;
  
  let processed = content;
  let match;
  
  while ((match = hqlImportPattern.exec(content)) !== null) {
    const [fullMatch, importSpecifier, importPath] = match;
    
    // Skip non-local imports
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;
    
    const fullPath = join(currentDir, importPath);
    
    try {
      const replacement = await processHqlImportInJs(importSpecifier, importPath, fullPath, visited);
      processed = processed.replace(fullMatch, replacement);
    } catch (error) {
      console.error(`Error handling HQL import in JS: ${importPath}`, error);
    }
  }
  
  return processed;
}

/**
 * Handle JS imports in JS content
 */
async function handleJsImportsInJs(
  content: string,
  currentDir: string,
  visited: Set<string>
): Promise<string> {
  // Match JS imports
  const jsImportPattern = /import\s+(\w+|\{\s*[^}]+\s*\}|\*\s+as\s+\w+)\s+from\s+["']([^"']+\.js)["'];/g;
  
  let processed = content;
  let match;
  
  while ((match = jsImportPattern.exec(content)) !== null) {
    const [fullMatch, importSpecifier, importPath] = match;
    
    // Skip non-local imports
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;
    
    const fullPath = join(currentDir, importPath);
    
    try {
      // Read the JS file
      const jsContent = await Deno.readTextFile(fullPath);
      
      // Process JS content to handle exports properly
      const processedContent = processJsContentForBundle(jsContent);
      
      // Process the import
      const replacement = await processImportInJs(importSpecifier, importPath, processedContent, dirname(fullPath), visited);
      processed = processed.replace(fullMatch, replacement);
    } catch (error) {
      console.error(`Error handling JS import in JS: ${importPath}`, error);
    }
  }
  
  return processed;
}

/**
 * Process JS content to make it bundle-friendly.
 * Specifically, handles export statements to be compatible with IIFE bundling.
 */
function processJsContentForBundle(content: string): string {
  // Process ES module export statements to be IIFE-compatible
  let processed = content;
  
  // Convert "export function name()" to "function name()" + "exports.name = name"
  processed = processed.replace(
    /export\s+function\s+(\w+)(\([^)]*\))\s*(\{[\s\S]*?\n\})/g,
    'function $1$2 $3\nexports.$1 = $1;'
  );
  
  // Convert "export const/let/var name" to "const/let/var name" + "exports.name = name"  
  processed = processed.replace(
    /export\s+(const|let|var)\s+(\w+)\s*=\s*([^;]+);/g,
    '$1 $2 = $3;\nexports.$2 = $2;'
  );
  
  // Convert "export class Name" to "class Name" + "exports.Name = Name"
  processed = processed.replace(
    /export\s+class\s+(\w+)(\s*\{[\s\S]*?\n\})/g, 
    'class $1$2\nexports.$1 = $1;'
  );
  
  // Convert "export default value" to "exports.default = value"
  processed = processed.replace(
    /export\s+default\s+([^;]+);/g,
    'exports.default = $1;'
  );
  
  // Convert "export { x, y as z }" to "exports.x = x; exports.z = y;"
  processed = processed.replace(
    /export\s*\{([^}]+)\};/g, 
    (match, exports) => {
      return exports
        .split(',')
        .map(exp => {
          const [name, alias] = exp.trim().split(/\s+as\s+/).map(s => s.trim());
          const exportName = alias || name;
          return `exports.${exportName} = ${name};`;
        })
        .join('\n');
    }
  );
  
  // Fix template literals
  processed = processed.replace(/\\`/g, '`');
  processed = processed.replace(/\\\${/g, '${');
  
  return processed;
}

/**
 * Fix logical operations in the generated code.
 */
function fixLogicalOperations(code: string): string {
  let processed = code;
  
  // Fix not() function calls
  const notPattern = /not\(([^)]+)\)/g;
  processed = processed.replace(notPattern, '!($1)');
  
  // Fix equals function calls
  const equalsPattern = /=\(([^,]+),\s*([^)]+)\)/g;
  processed = processed.replace(equalsPattern, '($1 === $2)');
  
  // Fix template literals
  processed = processed.replace(/\\`([^`]*)\\`/g, '`$1`');
  processed = processed.replace(/\\\${([^}]*)}/g, '${$1}');
  
  return processed;
}

/**
 * Legacy function to maintain API compatibility.
 */
export async function bundleJSModule(filePath: string, visited = new Set<string>()): Promise<string> {
  try {
    // Read the source file
    const source = await Deno.readTextFile(filePath);
    
    // Process the JS content to handle exports properly
    const processedSource = processJsContentForBundle(source);
    
    // Then process it with its dependencies
    return await bundleJsContent(processedSource, dirname(filePath), visited);
  } catch (error) {
    console.error(`Error bundling JS module ${filePath}:`, error);
    return `// Error bundling JS module: ${filePath}\n` +
           `console.error("Error bundling JS module ${filePath}: ${error instanceof Error ? error.message : String(error)}");\n`;
  }
}

/**
 * Helper function to escape regex special characters in a string.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}