// test/macro/do_test.ts
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-to-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for the do macro
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
        (def area (* 3.14 r-squared))
        area))
  `,
  multipleStatements: `
    (do
      (def a 1)
      (def b 2)
      (def c 3)
      (+ a (+ b c)))
  `,
  withConditional: `
    (do
      (def x 10)
      (if (> x 5)
          "greater"
          "lesser"))
  `,
  lastExpressionReturned: `
    (do
      (def first 1)
      (def second 2)
      (def third 3)
      third)
  `
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Tests for do macro
Deno.test("do macro - simple", async () => {
  const js = await transpileToJS(SAMPLES.simple);
  assertEquals(js.includes("function()"), true);
  assertEquals(js.includes("const x = 10"), true);
  assertEquals(js.includes("return x + 5"), true);
});

Deno.test("do macro - nested", async () => {
  const js = await transpileToJS(SAMPLES.nested);
  assertEquals(js.includes("function()"), true);
  assertEquals(js.includes("const outer = 1"), true);
  assertEquals(js.includes("function()"), true);
  assertEquals(js.includes("const inner = 2"), true);
  assertEquals(js.includes("return outer + inner"), true);
});

Deno.test("do macro - in function", async () => {
  const js = await transpileToJS(SAMPLES.inFunction);
  assertEquals(js.includes("function(radius)"), true);
  assertEquals(js.includes("function()"), true);
  assertEquals(js.includes("const r_squared = radius * radius"), true);
  assertEquals(js.includes("const area = 3.14 * r_squared"), true);
  assertEquals(js.includes("return area"), true);
});

Deno.test("do macro - multiple statements", async () => {
  const js = await transpileToJS(SAMPLES.multipleStatements);
  assertEquals(js.includes("function()"), true);
  assertEquals(js.includes("const a = 1"), true);
  assertEquals(js.includes("const b = 2"), true);
  assertEquals(js.includes("const c = 3"), true);
  assertEquals(js.includes("return a + (b + c)") || js.includes("return a + b + c"), true);
});

Deno.test("do macro - with conditional", async () => {
  const js = await transpileToJS(SAMPLES.withConditional);
  assertEquals(js.includes("function()"), true);
  assertEquals(js.includes("const x = 10"), true);
  assertEquals(js.includes("return x > 5 ? \"greater\" : \"lesser\""), true);
});

Deno.test("do macro - last expression returned", async () => {
  const js = await transpileToJS(SAMPLES.lastExpressionReturned);
  assertEquals(js.includes("function()"), true);
  assertEquals(js.includes("const first = 1"), true);
  assertEquals(js.includes("const second = 2"), true);
  assertEquals(js.includes("const third = 3"), true);
  assertEquals(js.includes("return third"), true);
});