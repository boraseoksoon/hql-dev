// test/macro/core_macros_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test the full suite of core macros in one sample
const CORE_MACROS_SAMPLE = `
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

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Test each macro individually
Deno.test("core macros - defn", async () => {
  const js = await transpileToJS("(defn test-fn (x) (+ x 1))");
  assertStringIncludes(js, "const test_fn = function(x)");
  assertStringIncludes(js, "return x + 1");
});

Deno.test("core macros - import", async () => {
  const js = await transpileToJS('(def path-mod (import "path"))');
  assertStringIncludes(js, "import * as");
  assertStringIncludes(js, "path");
});

Deno.test("core macros - export", async () => {
  const js = await transpileToJS('(export "value" 42)');
  assertStringIncludes(js, "export");
  assertStringIncludes(js, "value");
  assertStringIncludes(js, "42");
});

Deno.test("core macros - or", async () => {
  const js = await transpileToJS("(def or-result (or true false))");
  assertStringIncludes(js, "true ? true : false");
});

Deno.test("core macros - and", async () => {
  const js = await transpileToJS("(def and-result (and true (> 5 3)))");
  assertStringIncludes(js, "true ?");
  assertStringIncludes(js, "5 > 3");
});

Deno.test("core macros - not", async () => {
  const js = await transpileToJS("(def not-result (not false))");
  assertStringIncludes(js, "false ? 0 : 1");
});

Deno.test("core macros - do", async () => {
  const js = await transpileToJS(`
    (def do-result 
      (do
        (def temp 10)
        (+ temp 5)))
  `);
  assertStringIncludes(js, "function()");
  assertStringIncludes(js, "const temp = 10");
  assertStringIncludes(js, "return temp + 5");
});

Deno.test("core macros - cond", async () => {
  const js = await transpileToJS(`
    (def cond-result
      (cond
        ((> 5 3) "greater")
        (else "not greater")))
  `);
  assertStringIncludes(js, "5 > 3");
  assertStringIncludes(js, "\"greater\"");
  assertStringIncludes(js, "\"not greater\"");
});

// Test all macros together
Deno.test("core macros - all together", async () => {
  const js = await transpileToJS(CORE_MACROS_SAMPLE);
  
  // Check for presence of all macros
  assertStringIncludes(js, "function(x)");
  assertStringIncludes(js, "import");
  assertStringIncludes(js, "export");
  assertStringIncludes(js, "true ? true : false");
  assertStringIncludes(js, "5 > 3");
  assertStringIncludes(js, "false ? 0 : 1");
  assertStringIncludes(js, "function()");
  assertStringIncludes(js, "const temp = 10");
  assertStringIncludes(js, "5 > 3 ? \"greater\" : \"not greater\"");
});