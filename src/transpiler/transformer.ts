// src/transpiler/transformer.ts
import { HQLNode } from "./hql_ast.ts";
import { transformToIR } from "./hql-to-ir.ts";
import { convertIRToTSAST } from "./ir-to-ts-ast.ts";
import { generateTypeScript, CodeGenerationOptions } from "./ts-ast-to-code.ts";
import { join, resolve } from "jsr:@std/path@1.0.8";
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

async function postProcessGeneratedCode(
  code: string,
  currentDir: string,
  visited: Set<string>,
  useCommonJS: boolean
): Promise<string> {
  let processed = code;
  
  // First fix higher-order function handling and special placeholders
  processed = fixHigherOrderFunctions(processed);
  
  // Process HQL imports
  processed = await processHQLImports(processed, currentDir, visited);
  
  // Process JS imports
  processed = await processJSImports(processed, currentDir, visited);
  
  // Format exports based on module type
  if (useCommonJS) {
    processed = formatExportsForCommonJS(processed);
  }
  
  // Fix common issues
  processed = fixCommonIssues(processed);
  
  return processed;
}

/**
 * Fix higher-order function handling to replace special function placeholders
 */
function fixHigherOrderFunctions(code: string): string {
  // Replace $RETURN_FUNCTION(function() {...}) with function() {...}
  // when it's already in a return statement
  let processed = code.replace(
    /return\s+\$RETURN_FUNCTION\s*\(\s*(function\s*\([^)]*\)\s*\{[\s\S]*?\})\s*\)/g,
    'return $1'
  );
  
  // Handle any standalone instances with a return statement
  processed = processed.replace(
    /\$RETURN_FUNCTION\s*\(\s*(function\s*\([^)]*\)\s*\{[\s\S]*?\})\s*\)/g,
    'return $1'
  );
  
  return processed;
}

function fixCommonIssues(code: string): string {
  let fixed = code;
  // Remove leftover type hints like "->(Number)"
  fixed = fixed.replace(/->\([^)]*\)/g, "");
  // Remove trailing commas in function calls
  fixed = fixed.replace(/,\s*\)/g, ")");
  return fixed;
}

async function processHQLImports(
  code: string,
  currentDir: string,
  visited: Set<string>
): Promise<string> {
  const regex = /import\s+(\w+)\s+from\s+["']([^"']+\.hql)["'];/g;
  let match: RegExpExecArray | null;
  let processed = code;
  
  while ((match = regex.exec(code)) !== null) {
    const [fullMatch, importName, importPath] = match;
    const fullPath = resolve(join(currentDir, importPath));
    
    try {
      // Create a fresh visited set for this import chain but keep parent visited entries
      const importVisited = new Set<string>([...visited]);
      
      // Bundle the HQL file with its dependencies
      const bundled = await bundleFile(fullPath, importVisited, true);
      
      // Create a proper IIFE with the bundled code
      const replacement = `// HQL module bundled from ${importPath}
const ${importName} = (function() {
  const exports = {};
${bundled}
  return exports;
})();`;
      
      // Replace the import statement with the bundled IIFE
      processed = processed.replace(fullMatch, replacement);
    } catch (error) {
      console.error(`Error processing HQL import ${importPath}:`, error);
      
      // Replace with a placeholder that won't cause runtime errors
      const errorReplacement = `// Error bundling ${importPath}: ${error.message}
const ${importName} = {
  /* Failed to bundle HQL module */
};`;
      
      processed = processed.replace(fullMatch, errorReplacement);
    }
  }
  
  return processed;
}

async function processJSImports(
  code: string,
  currentDir: string,
  visited: Set<string>
): Promise<string> {
  const regex = /import\s+(\w+|\{[^}]+\}|\*\s+as\s+\w+)\s+from\s+["']([^"']+\.js)["'];/g;
  let match: RegExpExecArray | null;
  let processed = code;
  const replacements: { from: string; to: string }[] = [];
  
  while ((match = regex.exec(code)) !== null) {
    const [fullMatch, importSpecifier, importPath] = match;
    if (importPath.startsWith("./") || importPath.startsWith("../")) {
      try {
        const fullPath = join(currentDir, importPath);
        const importVisited = new Set<string>([...visited]);
        const bundled = await bundleJSModule(fullPath, importVisited);
        
        // Embed the bundled JS directly rather than using a temporary file
        const replacement = `// Inlined from ${importPath}
${bundled}`;
        replacements.push({ from: fullMatch, to: replacement });
      } catch (error) {
        console.error(`Error processing JS import ${importPath}:`, error);
      }
    }
  }
  
  for (const r of replacements) {
    processed = processed.replace(r.from, r.to);
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