// test/macro/comparison_operators_test.ts
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-to-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for comparison operators
const SAMPLES = {
  greaterThan: `(> 10 5)`,
  lessThan: `(< 5 10)`,
  greaterThanEqual: `(>= 10 10)`,
  lessThanEqual: `(<= 10 10)`,
  equal: `(= 10 10)`,
  notEqual: `(!= 10 5)`,
  withVariables: `
    (def a 10)
    (def b 5)
    (list (> a b) (< a b) (>= a b) (<= a b) (= a b) (!= a b))
  `,
  inFunctions: `
    (defn is-positive (n)
      (> n 0))
    (is-positive 5)
  `,
  withLogical: `
    (and (> 10 5) (< 20 30))
  `,
  complexInFunction: `
    (defn in-range (value min max)
      (and (>= value min) (<= value max)))
    (list (in-range 15 10 20) (in-range 5 10 20) (in-range 25 10 20))
  `
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Test that operators are correctly transpiled
Deno.test("comparison operators - greater than", async () => {
  const js = await transpileToJS(SAMPLES.greaterThan);
  assertEquals(js.includes("10 > 5"), true);
});

Deno.test("comparison operators - less than", async () => {
  const js = await transpileToJS(SAMPLES.lessThan);
  assertEquals(js.includes("5 < 10"), true);
});

Deno.test("comparison operators - greater than or equal", async () => {
  const js = await transpileToJS(SAMPLES.greaterThanEqual);
  assertEquals(js.includes("10 >= 10"), true);
});

Deno.test("comparison operators - less than or equal", async () => {
  const js = await transpileToJS(SAMPLES.lessThanEqual);
  assertEquals(js.includes("10 <= 10"), true);
});

Deno.test("comparison operators - equal", async () => {
  const js = await transpileToJS(SAMPLES.equal);
  assertEquals(js.includes("10 === 10"), true);
});

Deno.test("comparison operators - not equal", async () => {
  const js = await transpileToJS(SAMPLES.notEqual);
  assertEquals(js.includes("10 !== 5"), true);
});

Deno.test("comparison operators - with variables", async () => {
  const js = await transpileToJS(SAMPLES.withVariables);
  assertEquals(js.includes("const a = 10"), true);
  assertEquals(js.includes("const b = 5"), true);
  assertEquals(js.includes("a > b"), true);
  assertEquals(js.includes("a < b"), true);
  assertEquals(js.includes("a >= b"), true);
  assertEquals(js.includes("a <= b"), true);
  assertEquals(js.includes("a === b"), true);
  assertEquals(js.includes("a !== b"), true);
});

Deno.test("comparison operators - in functions", async () => {
  const js = await transpileToJS(SAMPLES.inFunctions);
  assertEquals(js.includes("function(n)"), true);
  assertEquals(js.includes("return n > 0"), true);
});

Deno.test("comparison operators - with logical operators", async () => {
  const js = await transpileToJS(SAMPLES.withLogical);
  assertEquals(js.includes("10 > 5"), true);
  assertEquals(js.includes("20 < 30"), true);
});

Deno.test("comparison operators - complex in function", async () => {
  const js = await transpileToJS(SAMPLES.complexInFunction);
  assertEquals(js.includes("function(value, min, max)"), true);
  assertEquals(js.includes("value >= min"), true);
  assertEquals(js.includes("value <= max"), true);
});