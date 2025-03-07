// test/macros/core_macros_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-to-ir.ts";
import { convertIRToTSAST } from "../../src/transpiler/ir-to-ts-ast.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-code.ts";
import { dirname } from "../../src/platform/platform.ts";

/**
 * Test to verify that core macros are correctly expanded.
 * This test looks at the macro expansion itself rather than final execution.
 */
Deno.test("core macros - correct expansion", async () => {
  // Sample that uses all core macros
  const sample = `
    ;; defn macro
    (defn test-fn (x) (+ x 1))
    
    ;; import macro
    (def path-mod (import "path"))
    
    ;; export macro
    (export "value" 42)
    
    ;; or macro
    (def or-result (or true false))
    
    ;; and macro
    (def and-result (and true (> 5 3)))
    
    ;; not macro
    (def not-result (not false))
    
    ;; do macro
    (def do-result 
      (do
        (def temp 10)
        (+ temp 5)))
    
    ;; cond macro
    (def cond-result
      (cond
        ((> 5 3) "greater")
        (else "not greater")))
  `;
  
  const ast = parse(sample);
  
  // Get the expanded AST
  const expandedAst = await expandMacros(ast);
  const expandedAstString = JSON.stringify(expandedAst);
  console.log("Expanded AST:", expandedAstString);
  
  // Test defn macro expansion
  assertStringIncludes(expandedAstString, `"name":"def"`);
  assertStringIncludes(expandedAstString, `"name":"test-fn"`);
  assertStringIncludes(expandedAstString, `"name":"fn"`);
  
  // Test import macro expansion
  assertStringIncludes(expandedAstString, `"name":"js-import"`);
  
  // Test export macro expansion
  assertStringIncludes(expandedAstString, `"name":"js-export"`);
  
  // Test or macro expansion
  assertStringIncludes(expandedAstString, `"name":"if"`); // or expands to if
  
  // Test and macro expansion
  assertStringIncludes(expandedAstString, `"name":"if"`); // and also expands to if
  
  // Test not macro expansion
  assertStringIncludes(expandedAstString, `"value":0`); // not uses 0 for false
  assertStringIncludes(expandedAstString, `"value":1`); // not uses 1 for true
  
  // Test do macro expansion
  assertStringIncludes(expandedAstString, `"name":"fn"`); // do uses an IIFE
  
  // Test cond macro expansion
  assertStringIncludes(expandedAstString, `"name":"if"`); // cond expands to if
  assertStringIncludes(expandedAstString, `"value":"greater"`);
});

/**
 * Test to verify that all core macros generate valid JavaScript.
 * This checks that the final JS output has the expected structure.
 */
Deno.test("core macros - valid JavaScript generation", async () => {
  // Sample that uses all core macros
  const sample = `
    ;; defn macro
    (defn test-fn (x) (+ x 1))
    
    ;; import macro
    (def path-mod (import "path"))
    
    ;; export macro
    (export "value" 42)
    
    ;; or macro
    (def or-result (or true false))
    
    ;; and macro
    (def and-result (and true (> 5 3)))
    
    ;; not macro
    (def not-result (not false))
    
    ;; do macro
    (def do-result 
      (do
        (def temp 10)
        (+ temp 5)))
    
    ;; cond macro
    (def cond-result
      (cond
        ((> 5 3) "greater")
        (else "not greater")))
  `;
  
  // Get the generated JavaScript
  const ast = parse(sample);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  const tsAst = convertIRToTSAST(ir);
  const js = generateTypeScript(tsAst);
  console.log("Generated JS:", js);
  
  // Test defn generates a function
  assertStringIncludes(js, "const test_fn = function(x)");
  
  // Test import generates import statements
  assertStringIncludes(js, "import");
  assertStringIncludes(js, "path");
  
  // Test export generates export statements
  assertStringIncludes(js, "export");
  assertStringIncludes(js, "value");
  
  // Test or generates conditional expression
  assertStringIncludes(js, "?");
  
  // Test and generates conditional expression
  assertStringIncludes(js, "?");
  
  // Test not generates conditional with 0/1
  assertStringIncludes(js, "?");
  assertStringIncludes(js, "0");
  assertStringIncludes(js, "1");
  
  // Test do generates IIFE
  assertStringIncludes(js, "function()");
  assertStringIncludes(js, "()");
  assertStringIncludes(js, "temp");
  
  // Test cond generates if-else
  assertStringIncludes(js, "?");
  assertStringIncludes(js, "\"greater\"");
});

/**
 * Test that verifies the fixed do macro works correctly with variable declarations.
 */
Deno.test("do macro - correct variable declaration handling", async () => {
  const sample = `
    (do
      (def x 10)
      (def y 20))
  `;
  
  const js = await transpileHQL(sample);
  console.log("Generated JS:", js);
  
  // Check that variable declarations are properly handled
  assertStringIncludes(js, "const x = 10");
  assertStringIncludes(js, "const y = 20");
  assertStringIncludes(js, "return y");
});

// Helper function to transpile HQL to JavaScript
async function transpileHQL(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  const tsAst = convertIRToTSAST(ir);
  return generateTypeScript(tsAst);
}