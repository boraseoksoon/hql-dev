// src/transpiler/transformer.ts
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

// This is a targeted update to the existing postProcessGeneratedCode function
// in src/transpiler/transformer.ts

async function postProcessGeneratedCode(
  code: string,
  currentDir: string,
  visited: Set<string>,
  useCommonJS: boolean
): Promise<string> {
  let processed = code;
  
  // First, extract and process any nested imports inside IIFEs
  processed = await extractNestedImports(processed, currentDir, visited);
  
  // Process HQL imports
  processed = await processHQLImports(processed, currentDir, visited);
  
  // Now process JS imports (with our new approach that doesn't use temp files)
  processed = await processJSImports(processed, currentDir, visited);
  
  // Format exports if CommonJS is used
  if (useCommonJS) {
    processed = formatExportsForCommonJS(processed);
  }
  
  // Clean up type annotations and logical operations
  processed = cleanupTypeAnnotations(processed);
  processed = fixLogicalOperations(processed);
  
  return processed;
}

// New helper to directly convert JS content to IIFE
async function convertJsToIIFE(jsFilePath: string, varName: string): Promise<string> {
  try {
    const fileContent = await Deno.readTextFile(jsFilePath);
    
    // Convert ESM export syntax to CommonJS
    let processedContent = fileContent
      // Convert export function to regular function + exports assignment
      .replace(/export\s+function\s+(\w+)/g, 'function $1')
      .replace(/export\s+const\s+(\w+)/g, 'const $1')
      .replace(/export\s+let\s+(\w+)/g, 'let $1')
      .replace(/export\s+var\s+(\w+)/g, 'var $1')
      .replace(/export\s+default\s+([^;]+);/g, 'exports.default = $1;')
      .replace(/export\s+\{([^}]+)\};/g, (match, exports) => {
        return exports.split(',')
          .map(exp => {
            const parts = exp.trim().split(/\s+as\s+/);
            if (parts.length > 1) {
              return `exports.${parts[1].trim()} = ${parts[0].trim()};`;
            }
            return `exports.${parts[0].trim()} = ${parts[0].trim()};`;
          })
          .join('\n');
      });
    
    // Create the IIFE wrapper
    return `// Bundled JS module
const ${varName} = (function() {
  const exports = {};
  
  ${processedContent}
  
  return exports;
})();`;
  } catch (error) {
    console.error(`Error reading JS file ${jsFilePath}:`, error);
    return `// Error bundling JS module ${jsFilePath}
const ${varName} = {
  error: "Failed to read module",
  message: "${error instanceof Error ? error.message : String(error)}"
};`;
  }
}

function cleanupTypeAnnotations(code: string): string {
  // Remove leftover type hints like "->(Number)"
  return code.replace(/->\([^)]*\)/g, "");
}

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

async function processHQLImports(
  code: string,
  currentDir: string,
  visited: Set<string>
): Promise<string> {
  // Regex pattern for JS files importing HQL files
  const esmRegex = /import\s+(?:\{[^}]*\}|[^{}\s]+)\s+from\s+["']([^"']+\.hql)["'];/g;
  
  // Regex pattern for HQL imports in initial transformation (IIFE with comment)
  const iifeRegex = /const\s+(\w+)\s+=\s+\(function\(\)[\s\S]*?\/\/\s+bundled\s+HQL\s+module:\s+([\w\d./\\-]+)/g;
  
  let processed = code;
  let match;
  
  // Process regular ESM imports (from JS files)
  while ((match = esmRegex.exec(code)) !== null) {
    const [fullMatch, importPath] = match;
    const importName = match[0].match(/import\s+(\w+)\s+from/)?.[1];
    const namedImports = match[0].match(/import\s+\{\s*([^}]+)\s*\}\s+from/)?.[1];
    
    const fullPath = join(currentDir, importPath);
    
    try {
      if (namedImports) {
        // Handle named imports
        const bundled = await bundleFile(fullPath, visited, true);
        const tempVar = `__hql_module_${Math.floor(Math.random() * 10000)}`;
        let replacement = `// Bundled HQL module: ${importPath}\nconst ${tempVar} = (function(){\n  const exports = {};\n  ${bundled}\n  return exports;\n})();\n`;
        
        // Extract each named export
        const importNames = namedImports.split(',').map(name => name.trim());
        for (const importName of importNames) {
          // Handle "as" aliasing
          let [originalName, alias] = importName.split(' as ').map(s => s.trim());
          alias = alias || originalName;
          replacement += `const ${alias} = ${tempVar}.${originalName};\n`;
        }
        
        processed = processed.replace(fullMatch, replacement);
      } else if (importName) {
        // Handle default import
        const bundled = await bundleFile(fullPath, visited, true);
        const replacement = `// Bundled HQL module: ${importPath}\nconst ${importName} = (function(){\n  const exports = {};\n  ${bundled}\n  return exports;\n})();`;
        processed = processed.replace(fullMatch, replacement);
      }
    } catch (e) {
      console.error(`Error bundling HQL import ${importPath}:`, e);
    }
  }
  
  // Process IIFE imports (from HQL files importing HQL)
  while ((match = iifeRegex.exec(code)) !== null) {
    const [partialMatch, importName, importPath] = match;
    const fullPath = join(currentDir, importPath);
    
    // Find the full IIFE to replace
    const fullIIFEPattern = new RegExp(`(const\\s+${importName}\\s+=\\s+\\(function\\(\\)[\\s\\S]*?return\\s+exports;\\s*\\}\\)\\(\\);)`);
    const fullMatch = fullIIFEPattern.exec(code);
    
    if (fullMatch) {
      try {
        const bundled = await bundleFile(fullPath, visited, true);
        const replacement = `const ${importName} = (function(){\n  const exports = {};\n  ${bundled}\n  return exports;\n})();`;
        processed = processed.replace(fullMatch[1], replacement);
      } catch (e) {
        console.error(`Error bundling HQL import ${importPath}:`, e);
      }
    }
  }
  
  return processed;
}

async function processJSImports(
  code: string,
  currentDir: string,
  visited: Set<string>
): Promise<string> {
  // Match ES6 import statements for local JS files
  const regex = /import\s+(\w+|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+["']([^"']+\.js)["'];/g;
  let processed = code;
  let match;
  
  // Process imports
  while ((match = regex.exec(code)) !== null) {
    const [fullMatch, importSpecifier, importPath] = match;
    const position = match.index;
    
    // Only process local relative paths
    if (importPath.startsWith("./") || importPath.startsWith("../")) {
      // Extract the import variable name (for default imports)
      const importName = importSpecifier.trim().match(/^\w+/)?.[0] || '';
      const isNested = isNestedImport(code, position);
      const fullPath = join(currentDir, importPath);
      
      try {
        // Read the JS file content directly
        const jsContent = await readJsFile(fullPath);
        
        // Process different import types
        if (importSpecifier.startsWith('{')) {
          // Named imports
          const namedImports = importSpecifier
            .replace(/^\{\s*|\s*\}$/g, '') // Remove braces
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          
          const tempVar = `__js_mod_${Math.floor(Math.random() * 10000)}`;
          let replacement = `// Bundled JS module from ${importPath}\nconst ${tempVar} = (function() {\n  const exports = {};\n  ${jsContent}\n  return exports;\n})();\n`;
          
          // Add each named import
          for (const item of namedImports) {
            const [name, alias] = item.split(/\s+as\s+/).map(s => s.trim());
            const localName = alias || name;
            replacement += `const ${localName} = ${tempVar}.${name};\n`;
          }
          
          processed = processed.replace(fullMatch, replacement);
        } else if (importSpecifier.startsWith('*')) {
          // Namespace import
          const namespaceVar = importSpecifier.replace(/^\*\s+as\s+/, '');
          const replacement = `// Bundled JS module from ${importPath}\nconst ${namespaceVar} = (function() {\n  const exports = {};\n  ${jsContent}\n  return exports;\n})();`;
          processed = processed.replace(fullMatch, replacement);
        } else {
          // Default import
          const replacement = `// Bundled JS module from ${importPath}\nconst ${importName} = (function() {\n  const exports = {};\n  ${jsContent}\n  return exports;\n})();`;
          processed = processed.replace(fullMatch, replacement);
        }
      } catch (e) {
        console.error(`Error processing JS import ${importPath}:`, e);
      }
    }
  }
  
  return processed;
}

// Check if an import is nested inside an IIFE
function isNestedImport(code: string, position: number): boolean {
  const beforeImport = code.substring(0, position);
  const openParens = (beforeImport.match(/\(/g) || []).length;
  const closeParens = (beforeImport.match(/\)/g) || []).length;
  return openParens > closeParens;
}

// Read and process a JS file
async function readJsFile(filePath: string): Promise<string> {
  try {
    const content = await Deno.readTextFile(filePath);
    
    // Convert ESM export syntax to CommonJS for bundling
    return content
      // Convert export function to regular function + exports assignment
      .replace(/export\s+function\s+(\w+)/g, 'function $1')
      .replace(/export\s+const\s+(\w+)/g, 'const $1')
      .replace(/export\s+let\s+(\w+)/g, 'let $1')
      .replace(/export\s+var\s+(\w+)/g, 'var $1')
      .replace(/export\s+default\s+([^;]+);/g, 'exports.default = $1;')
      .replace(/export\s+\{([^}]+)\};/g, (match, exports) => {
        return exports.split(',')
          .map(exp => {
            const parts = exp.trim().split(/\s+as\s+/);
            if (parts.length > 1) {
              return `exports.${parts[1].trim()} = ${parts[0].trim()};`;
            }
            return `exports.${parts[0].trim()} = ${parts[0].trim()};`;
          })
          .join('\n');
      });
  } catch (error) {
    console.error(`Error reading JS file ${filePath}:`, error);
    return `// Error reading file: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// Extract and process imports inside IIFEs
async function extractNestedImports(
  code: string,
  currentDir: string,
  visited: Set<string>
): Promise<string> {
  // Regex to identify import statements inside IIFEs
  const nestedImportRegex = /(const\s+\w+\s+=\s+\(function\(\)[\s\S]*?)(import\s+(\w+)\s+from\s+["']([^"']+\.js)["'];)([\s\S]*?return\s+exports;\s*\}\)\(\);)/g;
  
  let processed = code;
  let match;
  
  while ((match = nestedImportRegex.exec(code)) !== null) {
    const [fullMatch, prefix, importStmt, importVar, importPath, suffix] = match;
    
    // Only process local imports
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      const fullPath = join(currentDir, importPath);
      
      try {
        // Read the JS file directly
        const jsContent = await readJsFile(fullPath);
        
        // Replace the import with an IIFE
        const replacement = `${prefix}// Inlined module from ${importPath}
const ${importVar} = (function() {
  const exports = {};
  ${jsContent}
  return exports;
})();${suffix}`;
        
        processed = processed.replace(fullMatch, replacement);
      } catch (e) {
        console.error(`Error processing nested JS import ${importPath}:`, e);
      }
    }
  }
  
  return processed;
}

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