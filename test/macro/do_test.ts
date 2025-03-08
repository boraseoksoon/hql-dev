// test/macro/do_test.ts - Extended version to test multiple-expression support in the do macro
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-to-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Extended HQL samples for the do macro - supporting more than two expressions per do block
const SAMPLES = {
  simple: `
    (do
      (def x 10)
      (+ x 5))
  `,
  nested: `
    (do
      (def outer 1)
      (do
        (def inner 2)
        (+ outer inner)))
  `,
  inFunction: `
    (defn calculate-area (radius)
      (do
        (def r-squared (* radius radius))
        (* 3.14 r-squared)))
  `,
  twoStatements: `
    (do
      (def a 1)
      (def b 2))
  `,
  withConditional: `
    (do
      (def x 10)
      (if (> x 5)
          "greater"
          "lesser"))
  `,
  twoVariables: `
    (do
      (def first 1)
      (def second 2))
  `,
  threeExpressions: `
    (do
      (def a 1)
      (def b 2)
      (+ a b))
  `,
  fourExpressions: `
    (do
      (def x 10)
      (def y 20)
      (def z 5)
      (+ x y z))
  `,
  nestedManyExpressions: `
    (do
      (def outer 5)
      (def mid (+ outer 2))
      (def inner (* mid 2))
      inner)
  `,
  functionDoManyExpressions: `
    (defn compute (n)
      (do
        (def squared (* n n))
        (def doubled (* n 2))
        (+ squared doubled n)))
  `
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Existing tests
Deno.test("do macro - simple", async () => {
  const js = await transpileToJS(SAMPLES.simple);
  const containsX = js.includes("const x = 10");
  const containsReturn = js.includes("return x + 5");
  assertEquals(containsX && containsReturn, true);
});

Deno.test("do macro - nested", async () => {
  const js = await transpileToJS(SAMPLES.nested);
  const containsOuter = js.includes("const outer = 1");
  const containsInner = js.includes("const inner = 2");
  const containsReturn = js.includes("return outer + inner");
  assertEquals(containsOuter && containsInner && containsReturn, true);
});

Deno.test("do macro - in function", async () => {
  const js = await transpileToJS(SAMPLES.inFunction);
  const containsRSquared = js.includes("const r_squared = radius * radius");
  const containsReturn = js.includes("return 3.14 * r_squared");
  assertEquals(containsRSquared && containsReturn, true);
});

Deno.test("do macro - multiple statements", async () => {
  const js = await transpileToJS(SAMPLES.twoStatements);
  const containsA = js.includes("const a = 1");
  const containsB = js.includes("const b = 2");
  const containsReturn = js.includes("return");
  assertEquals(containsA && containsB && containsReturn, true);
});

Deno.test("do macro - with conditional", async () => {
  const js = await transpileToJS(SAMPLES.withConditional);
  const containsX = js.includes("const x = 10");
  const containsConditional = js.includes("x > 5");
  const containsResult = js.includes("greater") && js.includes("lesser");
  assertEquals(containsX && containsConditional && containsResult, true);
});

Deno.test("do macro - last expression returned", async () => {
  const js = await transpileToJS(SAMPLES.twoVariables);
  const containsFirst = js.includes("const first = 1");
  const containsSecond = js.includes("const second = 2");
  const containsReturn = js.includes("return");
  assertEquals(containsFirst && containsSecond && containsReturn, true);
});

// Additional tests for do macro with more than 2 expressions

Deno.test("do macro - three expressions", async () => {
  const js = await transpileToJS(SAMPLES.threeExpressions);
  const containsA = js.includes("const a = 1");
  const containsB = js.includes("const b = 2");
  // Check that the last expression (the sum) is returned:
  const containsReturn = js.includes("return a + b") || js.includes("return a+b");
  assertEquals(containsA && containsB && containsReturn, true);
});

Deno.test("do macro - four expressions", async () => {
  const js = await transpileToJS(SAMPLES.fourExpressions);
  const containsX = js.includes("const x = 10");
  const containsY = js.includes("const y = 20");
  const containsZ = js.includes("const z = 5");
  // Check that the sum of x, y, and z is returned:
  const containsReturn = js.includes("return x + y + z") || js.includes("return x+y+z");
  assertEquals(containsX && containsY && containsZ && containsReturn, true);
});

Deno.test("do macro - nested with many expressions", async () => {
  const js = await transpileToJS(SAMPLES.nestedManyExpressions);
  const containsOuter = js.includes("const outer = 5");
  const containsMid = js.includes("const mid = outer + 2") || js.includes("const mid = (outer + 2)");
  const containsInner = js.includes("const inner = mid * 2") || js.includes("const inner = (mid * 2)");
  const containsReturn = js.includes("return inner");
  assertEquals(containsOuter && containsMid && containsInner && containsReturn, true);
});

Deno.test("do macro - function do with many expressions", async () => {
  const js = await transpileToJS(SAMPLES.functionDoManyExpressions);
  // Verify function definition and do block expansion
  const containsSquared = js.includes("const squared = n * n") || js.includes("const squared = (n * n)");
  const containsDoubled = js.includes("const doubled = n * 2") || js.includes("const doubled = (n * 2)");
  const containsReturn = js.includes("return squared + doubled + n") ||
                         js.includes("return squared+doubled+n");
  assertEquals(containsSquared && containsDoubled && containsReturn, true);
});
