// test/macro/defn_test.ts
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-to-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for the defn macro
const SAMPLES = {
  basicFunction: `
    (defn increment (x) (+ x 1))
    (increment 5)
  `,
  multipleParameters: `
    (defn add-three (x y z) (+ (+ x y) z))
    (add-three 1 2 3)
  `,
  noParameters: `
    (defn get-ten () 10)
    (get-ten)
  `,
  withDo: `
    (defn calculate (x y)
      (do
        (def sum (+ x y))
        (def product (* x y))
        product))
    (calculate 3 4)
  `,
  withConditional: `
    (defn max-value (a b)
      (if (> a b) a b))
    (max-value 10 5)
  `,
  recursive: `
    (defn factorial (n)
      (if (<= n 1)
        1
        (* n (factorial (- n 1)))))
    (factorial 5)
  `,
  innerFunction: `
    (defn outer (x)
      (def inner (fn (y) (* y y)))
      inner)
    (outer 4)
  `
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Tests for defn macro
Deno.test("defn macro - basic function", async () => {
  const js = await transpileToJS(SAMPLES.basicFunction);
  assertEquals(js.includes("const increment = function(x)"), true);
  assertEquals(js.includes("return x + 1"), true);
  assertEquals(js.includes("increment(5)"), true);
});

Deno.test("defn macro - multiple parameters", async () => {
  const js = await transpileToJS(SAMPLES.multipleParameters);
  assertEquals(js.includes("const add_three = function(x, y, z)"), true);
  assertEquals(js.includes("return x + y + z") || js.includes("return (x + y) + z"), true);
  assertEquals(js.includes("add_three(1, 2, 3)"), true);
});

Deno.test("defn macro - no parameters", async () => {
  const js = await transpileToJS(SAMPLES.noParameters);
  assertEquals(js.includes("const get_ten = function()"), true);
  assertEquals(js.includes("return 10"), true);
  assertEquals(js.includes("get_ten()"), true);
});

Deno.test("defn macro - with do", async () => {
  const js = await transpileToJS(SAMPLES.withDo);
  assertEquals(js.includes("const calculate = function(x, y)"), true);
  assertEquals(js.includes("function()"), true); // IIFE from do
  assertEquals(js.includes("const sum = x + y"), true);
  assertEquals(js.includes("const product = x * y"), true);
  assertEquals(js.includes("return product"), true);
  assertEquals(js.includes("calculate(3, 4)"), true);
});

Deno.test("defn macro - with conditional", async () => {
  const js = await transpileToJS(SAMPLES.withConditional);
  assertEquals(js.includes("const max_value = function(a, b)"), true);
  assertEquals(js.includes("return a > b ? a : b"), true);
  assertEquals(js.includes("max_value(10, 5)"), true);
});

Deno.test("defn macro - recursive", async () => {
  const js = await transpileToJS(SAMPLES.recursive);
  assertEquals(js.includes("const factorial = function(n)"), true);
  assertEquals(js.includes("return n <= 1 ? 1 : n * factorial(n - 1)"), true);
  assertEquals(js.includes("factorial(5)"), true);
});

Deno.test("defn macro - inner function", async () => {
  const js = await transpileToJS(SAMPLES.innerFunction);
  assertEquals(js.includes("const outer = function(x)"), true);
  assertEquals(js.includes("const inner = function(y)"), true);
  assertEquals(js.includes("return y * y"), true);
  assertEquals(js.includes("return inner"), true);
  assertEquals(js.includes("outer(4)"), true);
});