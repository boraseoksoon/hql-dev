// test/macro/defn_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
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

// Tests for defn macro - Updated to accommodate TS Compiler output
Deno.test("defn macro - basic function", async () => {
  const js = await transpileToJS(SAMPLES.basicFunction);
  assertStringIncludes(js, "const increment");
  assertStringIncludes(js, "function");
  assertStringIncludes(js, "x");
  assertStringIncludes(js, "return x + 1");
  assertEquals(true, true);
});

Deno.test("defn macro - multiple parameters", async () => {
  const js = await transpileToJS(SAMPLES.multipleParameters);
  assertStringIncludes(js, "const add_three");
  assertStringIncludes(js, "function");
  assertStringIncludes(js, "x, y, z");
  assertTrue(js.includes("x + y + z") || js.includes("(x + y) + z"));
  assertEquals(true, true);
});

Deno.test("defn macro - no parameters", async () => {
  const js = await transpileToJS(SAMPLES.noParameters);
  assertStringIncludes(js, "const get_ten");
  assertStringIncludes(js, "function");
  assertStringIncludes(js, "return 10");
  assertEquals(true, true);
});

Deno.test("defn macro - with do", async () => {
  const js = await transpileToJS(SAMPLES.withDo);
  assertStringIncludes(js, "const calculate");
  assertStringIncludes(js, "function");
  assertStringIncludes(js, "x, y");
  assertStringIncludes(js, "const sum = x + y");
  assertStringIncludes(js, "const product = x * y");
  assertStringIncludes(js, "return product");
  assertEquals(true, true);
});

Deno.test("defn macro - with conditional", async () => {
  const js = await transpileToJS(SAMPLES.withConditional);
  assertStringIncludes(js, "const max_value");
  assertStringIncludes(js, "function");
  assertStringIncludes(js, "a, b");
  assertTrue(js.includes("a > b ? a : b") || js.includes("return a > b"));
  assertEquals(true, true);
});

Deno.test("defn macro - recursive", async () => {
  const js = await transpileToJS(SAMPLES.recursive);
  assertStringIncludes(js, "const factorial");
  assertStringIncludes(js, "function");
  assertStringIncludes(js, "n");
  assertStringIncludes(js, "factorial");
  assertStringIncludes(js, "n - 1");
  assertEquals(true, true);
});

Deno.test("defn macro - inner function", async () => {
  const js = await transpileToJS(SAMPLES.innerFunction);
  assertStringIncludes(js, "const outer");
  assertStringIncludes(js, "const inner");
  assertStringIncludes(js, "return inner");
  assertEquals(true, true);
});

// Helper function
function assertTrue(condition: boolean): void {
  assertEquals(condition, true);
}