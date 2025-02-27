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

async function postProcessGeneratedCode(
  code: string,
  currentDir: string,
  visited: Set<string>,
  useCommonJS: boolean
): Promise<string> {
  let processed = code;
  processed = await processHQLImports(processed, currentDir, visited);
  processed = await processJSImports(processed, currentDir, visited);
  
  if (useCommonJS) {
    processed = formatExportsForCommonJS(processed);
  }
  
  // Fix common issues
  processed = fixCommonIssues(processed);
  
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
  const replacements: { from: string; to: string }[] = [];
  while ((match = regex.exec(code)) !== null) {
    const [fullMatch, importName, importPath] = match;
    const fullPath = join(currentDir, importPath);
    try {
      const bundled = await bundleFile(fullPath, visited, true);
      const replacement = `const ${importName} = (function(){\n  const exports = {};\n  ${bundled}\n  return exports;\n})();`;
      replacements.push({ from: fullMatch, to: replacement });
    } catch (e) {
      console.error(`Error bundling HQL import ${importPath}:`, e);
    }
  }
  for (const r of replacements) {
    processed = processed.replace(r.from, r.to);
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
      const fullPath = join(currentDir, importPath);
      try {
        const bundled = await bundleJSModule(fullPath, visited);
        const tempFile = await Deno.makeTempFile({ suffix: ".js" });
        await Deno.writeTextFile(tempFile, bundled);
        const fileUrl = "file://" + tempFile;
        const replacement = fullMatch.replace(importPath, fileUrl);
        replacements.push({ from: fullMatch, to: replacement });
      } catch (e) {
        console.error(`Error processing JS import ${importPath}:`, e);
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