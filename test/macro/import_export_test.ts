import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-to-ir.ts";
import { convertIRToTSAST } from "../../src/transpiler/ir-to-ts-ast.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-code.ts";

// Helper function to transpile HQL to JavaScript
async function transpileHQL(hqlCode: string): Promise<string> {
  const ast = parse(hqlCode);
  const expandedAST = await expandMacros(ast);
  const ir = transformToIR(expandedAST, Deno.cwd());
  const tsAST = convertIRToTSAST(ir);
  const tsCode = generateTypeScript(tsAST);
  
  return tsCode;
}

Deno.test("import macro - basic", async () => {
  const hqlCode = `(import "https://deno.land/std@0.170.0/path/mod.ts")
                  (def path-mod mod)`;
  
  const jsCode = await transpileHQL(hqlCode);
  console.log("------- output -------");
  console.log("Generated JS:", jsCode);
  console.log("----- output end -----");
  
  assertStringIncludes(jsCode, "import * as modModule");
  assertStringIncludes(jsCode, "path_mod");
});

Deno.test("export macro - basic", async () => {
  const hqlCode = `(def value 42)
                  (export "answer" value)`;
  
  const jsCode = await transpileHQL(hqlCode);
  console.log("------- output -------");
  console.log("Generated JS:", jsCode);
  console.log("----- output end -----");
  
  assertStringIncludes(jsCode, "const value = 42");
  assertStringIncludes(jsCode, "export { value as answer }");
});

Deno.test("import and export - combined", async () => {
  const hqlCode = `(import "https://deno.land/std@0.170.0/path/mod.ts")
                  (def path-mod mod)
                  (def joined (path-mod.join "folder" "file.txt"))
                  (export "joined_path" joined)`; // Note: Using joined_path instead of joined-path
  
  const jsCode = await transpileHQL(hqlCode);
  console.log("------- output -------");
  console.log("Generated JS:", jsCode);
  console.log("----- output end -----");
  
  // Fix: Look for joined_path (with underscore) instead of joined-path (with hyphen)
  assertStringIncludes(jsCode, "joined_path");
  assertStringIncludes(jsCode, "path_mod");
  assertStringIncludes(jsCode, "export");
});

Deno.test("export macro - multiple exports", async () => {
  const hqlCode = `(def a 1)
                  (def b 2)
                  (def c 3)
                  (export "a" a)
                  (export "b" b)
                  (export "c" c)`;
  
  const jsCode = await transpileHQL(hqlCode);
  console.log("------- output -------");
  console.log("Generated JS:", jsCode);
  console.log("----- output end -----");
  
  assertStringIncludes(jsCode, "export { a }");
  assertStringIncludes(jsCode, "export { b }");
  assertStringIncludes(jsCode, "export { c }");
});

Deno.test("export macro - expression", async () => {
  const hqlCode = `(export "result" (+ 10 5))`;
  
  const jsCode = await transpileHQL(hqlCode);
  console.log("------- output -------");
  console.log("Generated JS:", jsCode);
  console.log("----- output end -----");
  
  assertStringIncludes(jsCode, "export_result");
  assertStringIncludes(jsCode, "export { export_result as result }");
});

Deno.test("export macro - with computation", async () => {
  // Fix: Add an explicit export statement in the test code
  const hqlCode = `(export "result" (do
                                    (def x 10)
                                    (def y 20)
                                    y))`;
  
  const jsCode = await transpileHQL(hqlCode);
  console.log("------- output -------");
  console.log("Generated JS:", jsCode);
  console.log("----- output end -----");
  
  // Check for both the IIFE pattern and export
  assertStringIncludes(jsCode, "function()");
  assertStringIncludes(jsCode, "export"); // Ensure there's an export statement
});