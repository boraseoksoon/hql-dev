// test/macro/cond_test.ts
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-to-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for the cond macro
const SAMPLES = {
  trueCondition: `
    (cond
      ((> 5 3) "greater")
      ((< 5 3) "not greater"))
  `,
  falseCondition: `
    (cond
      ((< 5 3) "lesser")
      ((> 5 3) "not lesser"))
  `,
  inFunction: `
    (defn classify (n)
      (cond
        ((< n 0) "negative")
        ((> n 0) "non-negative")))
    (list (classify -5) (classify 5))
  `,
  withComplexExpressions: `
    (cond
      ((do
         (def x 10)
         (< x 5)) "x is small")
      ((= 1 1) "x is not small"))
  `
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Tests for cond macro
Deno.test("cond macro - with true condition", async () => {
  const js = await transpileToJS(SAMPLES.trueCondition);
  assertEquals(js.includes("5 > 3"), true);
  assertEquals(js.includes("\"greater\""), true);
  assertEquals(js.includes("\"not greater\""), true);
});

Deno.test("cond macro - with false condition", async () => {
  const js = await transpileToJS(SAMPLES.falseCondition);
  assertEquals(js.includes("5 < 3"), true);
  assertEquals(js.includes("\"lesser\""), true);
  assertEquals(js.includes("\"not lesser\""), true);
});

Deno.test("cond macro - in function", async () => {
  const js = await transpileToJS(SAMPLES.inFunction);
  assertEquals(js.includes("function(n)"), true);
  assertEquals(js.includes("n < 0"), true);
  assertEquals(js.includes("\"negative\""), true);
  assertEquals(js.includes("\"non-negative\""), true);
});

Deno.test("cond macro - with complex expressions", async () => {
  const js = await transpileToJS(SAMPLES.withComplexExpressions);
  assertEquals(js.includes("function()"), true);
  assertEquals(js.includes("const x = 10"), true);
  assertEquals(js.includes("x < 5"), true);
  assertEquals(js.includes("\"x is small\""), true);
  assertEquals(js.includes("\"x is not small\""), true);
});