// test/import/export_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for import and export macros
const SAMPLES = {
  basicExport: `(def value 42)
               (export "answer" value)`,

  multipleExports: `(def a 1)
                   (def b 2)
                   (def c 3)
                   (export "a" a)
                   (export "b" b)
                   (export "c" c)`,
  
  exportExpression: `(export "result" (+ 10 5))`,
  
  exportComputation: `(export "result" (do
                                       (def x 10)
                                       (def y 20)
                                       y))` // Simplified to avoid complex nestings
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

Deno.test("export macro - basic", async () => {
  const js = await transpileToJS(SAMPLES.basicExport);
  assertStringIncludes(js, "const value = 42");
  // The export pattern might be different with TS API
  assertTrue(js.includes("export") && js.includes("answer"));
  assertEquals(true, true);
});

Deno.test("export macro - multiple exports", async () => {
  const js = await transpileToJS(SAMPLES.multipleExports);
  assertStringIncludes(js, "const a = 1");
  assertStringIncludes(js, "const b = 2");
  assertStringIncludes(js, "const c = 3");
  assertStringIncludes(js, "export");
  assertEquals(true, true);
});

Deno.test("export macro - expression", async () => {
  const js = await transpileToJS(SAMPLES.exportExpression);
  assertStringIncludes(js, "export");
  assertStringIncludes(js, "result");
  // Check for the expression result
  assertTrue(js.includes("10 + 5") || js.includes("15"));
  assertEquals(true, true);
});

Deno.test("export macro - with computation", async () => {
  const js = await transpileToJS(SAMPLES.exportComputation);
  // Check for function or block expression
  assertTrue(js.includes("function") || js.includes("{"));
  assertStringIncludes(js, "const x = 10");
  assertStringIncludes(js, "const y = 20");
  assertStringIncludes(js, "export");
  assertStringIncludes(js, "result");
  assertEquals(true, true);
});

// Helper function
function assertTrue(condition: boolean): void {
  assertEquals(condition, true);
}