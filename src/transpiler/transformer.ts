// src/transpiler/transformer.ts - Updated to fix JS module handling
import { HQLNode } from "./hql_ast.ts";
import { transformToIR } from "./hql-to-ir.ts";
import { convertIRToTSAST } from "./ir-to-ts-ast.ts";
import { generateTypeScript, CodeGenerationOptions } from "./ts-ast-to-code.ts";
import { join, dirname } from "jsr:@std/path@1.0.8"; // Ensure dirname is imported
import { bundleFile } from "../bundler/bundler.ts";

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

// This is the main function that processes the generated JavaScript
async function postProcessGeneratedCode(
  code: string,
  currentDir: string,
  visited: Set<string>,
  useCommonJS: boolean
): Promise<string> {
  let processed = code;
  
  // Process HQL imports first
  processed = await processHQLImports(processed, currentDir, visited);
  
  // Process JS imports
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

// Process HQL imports
async function processHQLImports(
  code: string,
  currentDir: string,
  visited: Set<string>
): Promise<string> {
  // Regex for HQL imports in initial transformation (IIFE with comment)
  const iifeRegex = /const\s+(\w+)\s+=\s+\(function\(\)[\s\S]*?\/\/\s+bundled\s+HQL\s+module:\s+([\w\d./\\-]+)/g;
  
  let processed = code;
  let match;
  
  // Process IIFE imports (from HQL files importing HQL)
  while ((match = iifeRegex.exec(code)) !== null) {
    const [partialMatch, importName, importPath] = match;
    const fullPath = join(currentDir, importPath);
    
    // Find the full IIFE to replace
    const fullIIFEPattern = new RegExp(`(const\\s+${importName}\\s+=\\s+\\(function\\(\\)[\\s\\S]*?return\\s+exports;\\s*\\}\\)\\(\\);)`);
    const fullMatch = fullIIFEPattern.exec(processed);
    
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

// Process JS imports
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
    
    // Only process local relative paths
    if (importPath.startsWith("./") || importPath.startsWith("../")) {
      const fullPath = join(currentDir, importPath);
      
      try {
        // Read the JS file content
        const jsContent = await Deno.readTextFile(fullPath);
        
        // Transform ES module syntax to CommonJS style for use in IIFE
        const transformedContent = transformJsForIife(jsContent);
        
        // Process different import types
        if (importSpecifier.startsWith('{')) {
          // Named imports
          const namedImports = importSpecifier
            .replace(/^\{\s*|\s*\}$/g, '') // Remove braces
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          
          const tempVar = `__js_mod_${Math.floor(Math.random() * 10000)}`;
          let replacement = `// Bundled JS module from ${importPath}\nconst ${tempVar} = (function() {\n  const exports = {};\n  ${transformedContent}\n  return exports;\n})();\n`;
          
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
          const replacement = `// Bundled JS module from ${importPath}\nconst ${namespaceVar} = (function() {\n  const exports = {};\n  ${transformedContent}\n  return exports;\n})();`;
          processed = processed.replace(fullMatch, replacement);
        } else {
          // Default import
          const importName = importSpecifier.trim();
          const replacement = `// Bundled JS module from ${importPath}\nconst ${importName} = (function() {\n  const exports = {};\n  ${transformedContent}\n  return exports;\n})();`;
          processed = processed.replace(fullMatch, replacement);
        }
      } catch (e) {
        console.error(`Error processing JS import ${importPath}:`, e);
      }
    }
  }
  
  return processed;
}

/**
 * Transform JS with ES module syntax for use in an IIFE.
 * This converts export statements to CommonJS style exports
 * while preserving template literals.
 */
function transformJsForIife(jsContent: string): string {
  // Remove any "export" keyword from function, variable, or class declarations.
  // (A simple regex; adjust if your JS uses more complex patterns.)
  let processed = jsContent.replace(/\bexport\s+(?=function\b)/g, "");
  processed = processed.replace(/\bexport\s+(?=const\b)/g, "");
  processed = processed.replace(/\bexport\s+(?=let\b)/g, "");
  processed = processed.replace(/\bexport\s+(?=var\b)/g, "");
  processed = processed.replace(/\bexport\s+(?=class\b)/g, "");
  // Also remove any "export default" (if present)
  processed = processed.replace(/\bexport\s+default\s+/g, "");
  // Finally, remove ES6 module import statements (they’re handled separately)
  processed = processed.replace(/import\s+.*?from\s+["'][^"']+["'];/g, "// import handled separately");
  
  return processed;
}

function cleanupTypeAnnotations(code: string): string {
  return code.replace(/->\([^)]*\)/g, "");
}

function fixLogicalOperations(code: string): string {
  let processed = code;
  
  // Fix not() function calls 
  processed = processed.replace(/not\(([^)]+)\)/g, '!($1)');
  
  // Fix equals function calls
  processed = processed.replace(/=\(([^,]+),\s*([^)]+)\)/g, '($1 === $2)');
  
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