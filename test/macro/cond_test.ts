// test/macro/cond_test.ts - Focused on testing multiple conditions
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-code-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for the cond macro
const SAMPLES = {
  // Original basic test
  basicCond: `
    (cond
      ((> 5 3) "greater")
      ((< 5 3) "not greater"))
  `,
  
  // Test with multiple clauses (3+)
  multipleConditions: `
    (def x 50)
    (def result 
      (cond
        ((< x 0) "negative")
        ((= x 0) "zero")
        ((< x 10) "small")
        ((< x 100) "medium")
        (true "large")))
    result
  `,
  
  // Test using true as default case
  trueAsDefault: `
    (def x 5)
    (cond
      ((< x 0) "negative")
      ((= x 0) "zero")
      (true "positive"))
  `,
  
  // Simple nested cond
  simplenestedCond: `
    (def x 5)
    (def y -3)
    (cond
      ((< x 0) "x negative")
      ((= x 0) "x zero")
      (true (cond
              ((< y 0) "x positive, y negative")
              (true "x positive, y positive"))))
  `
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Original test for basic cond
Deno.test("cond macro - basic test", async () => {
  const js = await transpileToJS(SAMPLES.basicCond);
  assertStringIncludes(js, "5 > 3");
  assertStringIncludes(js, "\"greater\"");
  assertStringIncludes(js, "\"not greater\"");
});

// Test multiple conditions
Deno.test("cond macro - multiple conditions", async () => {
  const js = await transpileToJS(SAMPLES.multipleConditions);
  // Check for all conditions
  assertStringIncludes(js, "x < 0");
  assertStringIncludes(js, "x === 0");
  assertStringIncludes(js, "x < 10");
  assertStringIncludes(js, "x < 100");
  
  // Verify true default case
  assertStringIncludes(js, "true");
  
  // Verify chained ternary structure
  const hasChainedTernary = js.includes("?") && js.includes(":");
  assertEquals(hasChainedTernary, true);
  
  // Check all results are present
  assertStringIncludes(js, "\"negative\"");
  assertStringIncludes(js, "\"zero\"");
  assertStringIncludes(js, "\"small\"");
  assertStringIncludes(js, "\"medium\"");
  assertStringIncludes(js, "\"large\"");
});

// Test true as default
Deno.test("cond macro - true as default", async () => {
  const js = await transpileToJS(SAMPLES.trueAsDefault);
  assertStringIncludes(js, "x < 0");
  assertStringIncludes(js, "x === 0");
  assertStringIncludes(js, "true");
  assertStringIncludes(js, "\"negative\"");
  assertStringIncludes(js, "\"zero\"");
  assertStringIncludes(js, "\"positive\"");
});

// Test simple nested cond
Deno.test("cond macro - simple nested cond", async () => {
  const js = await transpileToJS(SAMPLES.simplenestedCond);
  // Check outer conditions
  assertStringIncludes(js, "x < 0");
  assertStringIncludes(js, "x === 0");
  assertStringIncludes(js, "true");
  
  // Check inner conditions
  assertStringIncludes(js, "y < 0");
  
  // Check results
  assertStringIncludes(js, "\"x negative\"");
  assertStringIncludes(js, "\"x zero\"");
  assertStringIncludes(js, "\"x positive, y negative\"");
  assertStringIncludes(js, "\"x positive, y positive\"");
});