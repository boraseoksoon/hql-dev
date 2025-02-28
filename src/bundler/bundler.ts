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
    
    // First, process any HQL module references
    processed = await processHqlImports(processed, currentDir, clonedVisited);
    
    // Then process JS imports
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
  const importPattern = /import\s+(\w+)\s+from\s+["']([^"']+\.js)["'];/g;
  
  // Regex for nested import statements (in IIFEs)
  const nestedImportPattern = /(const\s+\w+\s+=\s+\(function\(\)\s*\{\s*const\s+exports\s+=\s+\{\};[\s\S]*?)(import\s+(\w+)\s+from\s+["']([^"']+\.js)["'];)([\s\S]*?return\s+exports;\s*\}\)\(\);)/g;
  
  let processed = code;
  
  // First, process nested imports (imports inside IIFEs)
  let nestedMatch;
  while ((nestedMatch = nestedImportPattern.exec(code)) !== null) {
    const [fullMatch, prefix, importStmt, importVar, importPath, suffix] = nestedMatch;
    
    // Skip non-local imports
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;
    
    const fullPath = join(currentDir, importPath);
    
    try {
      // Read and bundle the imported JS
      const jsContent = await Deno.readTextFile(fullPath);
      const bundledJs = await processJsModule(jsContent, dirname(fullPath), visited);
      
      // Replace the import with an inline IIFE
      const replacement = `${prefix}// Bundled JS module from ${importPath}
const ${importVar} = (function() {
  const exports = {};
  ${bundledJs}
  return exports;
})();${suffix}`;
      
      processed = processed.replace(fullMatch, replacement);
    } catch (error) {
      console.error(`Error processing nested JS import ${importPath}:`, error);
    }
  }
  
  // Now process top-level imports
  let match;
  while ((match = importPattern.exec(processed)) !== null) {
    const [fullMatch, importVar, importPath] = match;
    
    // Skip non-local imports
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;
    
    const fullPath = join(currentDir, importPath);
    
    try {
      // Read and bundle the JS module
      const jsContent = await Deno.readTextFile(fullPath);
      const bundledJs = await processJsModule(jsContent, dirname(fullPath), visited);
      
      // Replace with IIFE
      const replacement = `// Bundled JS module from ${importPath}
const ${importVar} = (function() {
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
 * Process nested JS imports (imports inside IIFEs).
 */
async function processNestedJsImports(
  code: string,
  currentDir: string,
  visited: Set<string>
): Promise<string> {
  // Regex for nested import statements
  const nestedImportRegex = /(const\s+\w+\s+=\s+\(function\(\)\s*\{\s*const\s+exports\s+=\s+\{\};[\s\S]*?)(import\s+(\w+|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+["']([^"']+)["'];)([\s\S]*?return\s+exports;\s*\}\)\(\);)/g;
  
  let processed = code;
  let match;
  
  // Process nested imports
  while ((match = nestedImportRegex.exec(code)) !== null) {
    const [fullMatch, prefix, importStmt, importSpecifier, importPath, suffix] = match;
    
    // Skip non-local imports
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;
    
    const isHqlImport = importPath.endsWith('.hql');
    const isJsImport = importPath.endsWith('.js');
    
    if (!isHqlImport && !isJsImport) continue;
    
    const fullPath = join(currentDir, importPath);
    
    try {
      // Process depending on the import type
      if (isHqlImport) {
        // For HQL imports
        const bundledHql = await bundleFile(fullPath, visited, true);
        
        // Create variable name and variables
        const tempVar = `__hql_mod_${Math.floor(Math.random() * 10000)}`;
        let replacement = `${prefix}// Bundled HQL module from ${importPath}\n`;
        replacement += `const ${tempVar} = (function() {\n  const exports = {};\n  ${bundledHql}\n  return exports;\n})();\n`;
        
        // Handle different import types
        if (importSpecifier.startsWith('{')) {
          // Named imports
          const namedImports = importSpecifier
            .replace(/^\{\s*|\s*\}$/g, '')
            .split(',')
            .map(s => s.trim());
          
          for (const item of namedImports) {
            const parts = item.split(/\s+as\s+/);
            const name = parts[0].trim();
            const alias = parts.length > 1 ? parts[1].trim() : name;
            replacement += `const ${alias} = ${tempVar}.${name};\n`;
          }
        } else {
          // Default import
          replacement += `const ${importSpecifier} = ${tempVar};\n`;
        }
        
        replacement += suffix;
        processed = processed.replace(fullMatch, replacement);
      }
      
      else if (isJsImport) {
        // For JS imports
        const jsContent = await Deno.readTextFile(fullPath);
        const processedJs = processJsForIife(jsContent);  // Make sure to process JS for IIFE
        
        // Create variable name and variables
        const tempVar = `__js_mod_${Math.floor(Math.random() * 10000)}`;
        let replacement = `${prefix}// Bundled JS module from ${importPath}\n`;
        replacement += `const ${tempVar} = (function() {\n  const exports = {};\n  ${processedJs}\n  return exports;\n})();\n`;
        
        // Handle different import types
        if (importSpecifier.startsWith('{')) {
          // Named imports
          const namedImports = importSpecifier
            .replace(/^\{\s*|\s*\}$/g, '')
            .split(',')
            .map(s => s.trim());
          
          for (const item of namedImports) {
            const parts = item.split(/\s+as\s+/);
            const name = parts[0].trim();
            const alias = parts.length > 1 ? parts[1].trim() : name;
            replacement += `const ${alias} = ${tempVar}.${name};\n`;
          }
        } else if (importSpecifier.startsWith('*')) {
          // Namespace import
          const nsName = importSpecifier.replace(/^\*\s+as\s+/, '');
          replacement += `const ${nsName} = ${tempVar};\n`;
        } else {
          // Default import
          replacement += `const ${importSpecifier} = ${tempVar};\n`;
        }
        
        replacement += suffix;
        processed = processed.replace(fullMatch, replacement);
      }
    } catch (error) {
      console.error(`Error processing nested import ${importPath}:`, error);
    }
  }
  
  return processed;
}

/**
 * Process top-level JS imports.
 */
async function processTopLevelJsImports(
  code: string,
  currentDir: string,
  visited: Set<string>
): Promise<string> {
  // Regex for normal import statements for JS files
  const importPattern = /import\s+(\w+|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+["']([^"']+\.js)["'];/g;
  
  let processed = code;
  let match;
  
  // Process top-level imports
  while ((match = importPattern.exec(code)) !== null) {
    const [fullMatch, importSpecifier, importPath] = match;
    
    // Skip non-local imports
    if (!importPath.startsWith('./') && !importPath.startsWith('../')) continue;
    
    const fullPath = join(currentDir, importPath);
    
    try {
      // Read the JS file
      const jsContent = await Deno.readTextFile(fullPath);
      
      // Process the JS content - important to use processJsForIife here
      const processedJs = processJsForIife(jsContent);
      
      // Process different import types
      if (importSpecifier.startsWith('{')) {
        // Named imports
        const namedImports = importSpecifier
          .replace(/^\{\s*|\s*\}$/g, '') // Remove braces
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        const tempVar = `__js_mod_${Math.floor(Math.random() * 10000)}`;
        let replacement = `// Bundled JS module from ${importPath}\nconst ${tempVar} = (function() {\n  const exports = {};\n  ${processedJs}\n  return exports;\n})();\n`;
        
        // Add each named import
        for (const item of namedImports) {
          const parts = item.split(/\s+as\s+/);
          const name = parts[0].trim();
          const alias = parts.length > 1 ? parts[1].trim() : name;
          replacement += `const ${alias} = ${tempVar}.${name};\n`;
        }
        
        processed = processed.replace(fullMatch, replacement);
      } else if (importSpecifier.startsWith('*')) {
        // Namespace import
        const namespaceVar = importSpecifier.replace(/^\*\s+as\s+/, '');
        const replacement = `// Bundled JS module from ${importPath}\nconst ${namespaceVar} = (function() {\n  const exports = {};\n  ${processedJs}\n  return exports;\n})();`;
        processed = processed.replace(fullMatch, replacement);
      } else {
        // Default import
        const importName = importSpecifier.trim();
        const replacement = `// Bundled JS module from ${importPath}\nconst ${importName} = (function() {\n  const exports = {};\n  ${processedJs}\n  return exports;\n})();`;
        processed = processed.replace(fullMatch, replacement);
      }
    } catch (error) {
      console.error(`Error processing JS import ${importPath}:`, error);
    }
  }
  
  return processed;
}

/**
 * Fix specific imports that require special handling.
 * This is based on known modules and their export patterns.
 */
function fixSpecificImports(code: string): string {
  let processed = code;
  
  // Known modules that provide namespace exports
  const namespaceModules = [
    // Deno standard library
    "https://deno.land/std",
    // mathjs from npm needs namespace import
    "npm:mathjs"
  ];
  
  // Known modules that provide default exports
  const defaultModules = [
    // JSR modules that need default imports
    "jsr:@nothing628/chalk",
    // Keep lodash as default import
    "npm:lodash"
  ];
  
  // Process namespace modules
  for (const mod of namespaceModules) {
    const defaultRegex = new RegExp(`import\\s+(\\w+)\\s+from\\s+["']([^"']*${escapeRegExp(mod)}[^"']*)["'];`, 'g');
    processed = processed.replace(defaultRegex, 'import * as $1 from "$2";');
  }
  
  // Process default modules
  for (const mod of defaultModules) {
    const namespaceRegex = new RegExp(`import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s+["']([^"']*${escapeRegExp(mod)}[^"']*)["'];`, 'g');
    processed = processed.replace(namespaceRegex, 'import $1 from "$2";');
  }
  
  return processed;
}

/**
 * Process a JavaScript file for inclusion in an IIFE.
 * Preserves template literals while converting export statements.
 */
function processJsForIife(jsContent: string): string {
  // First extract and save template literals to avoid processing them
  const templateLiterals: string[] = [];
  const placeholderPattern = "__TEMPLATE_LITERAL_PLACEHOLDER_";
  
  // Replace template literals with placeholders
  let processed = jsContent.replace(/`([\s\S]*?)`/g, (match) => {
    const id = templateLiterals.length;
    templateLiterals.push(match);
    return placeholderPattern + id;
  });
  
  // Process export statements
  processed = processed
    // Handle export function
    .replace(/export\s+function\s+(\w+)(\s*\([^)]*\)\s*\{[\s\S]*?\n\})/g, 
             "function $1$2\nexports.$1 = $1;")
    
    // Handle export const/let/var
    .replace(/export\s+(const|let|var)\s+(\w+)(\s*=\s*[^;]+;)/g, 
             "$1 $2$3\nexports.$2 = $2;")
    
    // Handle export default
    .replace(/export\s+default\s+([^;]+);/g, 
             "exports.default = $1;")
    
    // Handle named exports: export { x, y as z }
    .replace(/export\s*\{([^}]+)\};/g, (match, exportList) => {
      return exportList.split(',')
        .map(exp => {
          const parts = exp.trim().split(/\s+as\s+/);
          const local = parts[0].trim();
          const exported = parts.length > 1 ? parts[1].trim() : local;
          return `exports.${exported} = ${local};`;
        })
        .join('\n');
    });
  
  // Remove import statements (they'll be handled separately)
  processed = processed.replace(/import\s+.*?from\s+["'][^"']+["'];/g, '// Import handled separately');
  
  // Restore template literals
  for (let i = 0; i < templateLiterals.length; i++) {
    processed = processed.replace(new RegExp(placeholderPattern + i, 'g'), templateLiterals[i]);
  }
  
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
  
  return processed;
}

/**
 * Helper function to escape regex special characters in a string.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}