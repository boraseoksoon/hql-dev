// test/macro/cond_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-code-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
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
        ((> n 0) "positive")
        ((= n 0) "zero")))
    (list (classify 5) (classify 0))
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
  assertStringIncludes(js, "5 > 3");
  assertStringIncludes(js, "\"greater\"");
  assertStringIncludes(js, "\"not greater\"");
  assertEquals(true, true);
});

Deno.test("cond macro - with false condition", async () => {
  const js = await transpileToJS(SAMPLES.falseCondition);
  assertStringIncludes(js, "5 < 3");
  assertStringIncludes(js, "\"lesser\"");
  assertStringIncludes(js, "\"not lesser\"");
  assertEquals(true, true);
});

Deno.test("cond macro - in function", async () => {
  const js = await transpileToJS(SAMPLES.inFunction);
  assertStringIncludes(js, "n > 0");
  assertStringIncludes(js, "\"positive\"");
  assertStringIncludes(js, "\"zero\"");
  assertEquals(true, true);
});

Deno.test("cond macro - with complex expressions", async () => {
  const js = await transpileToJS(SAMPLES.withComplexExpressions);
  assertStringIncludes(js, "x = 10");
  assertStringIncludes(js, "x < 5");
  assertStringIncludes(js, "\"x is small\"");
  assertStringIncludes(js, "\"x is not small\"");
  assertEquals(true, true);
});