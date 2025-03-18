// test/macro/comparison_operators_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
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

// Test that operators are correctly transpiled - updated to be more flexible
Deno.test("comparison operators - greater than", async () => {
  const js = await transpileToJS(SAMPLES.greaterThan);
  assertStringIncludes(js, "10 > 5");
  assertEquals(true, true);
});

Deno.test("comparison operators - less than", async () => {
  const js = await transpileToJS(SAMPLES.lessThan);
  assertStringIncludes(js, "5 < 10");
  assertEquals(true, true);
});

Deno.test("comparison operators - greater than or equal", async () => {
  const js = await transpileToJS(SAMPLES.greaterThanEqual);
  assertStringIncludes(js, "10 >= 10");
  assertEquals(true, true);
});

Deno.test("comparison operators - less than or equal", async () => {
  const js = await transpileToJS(SAMPLES.lessThanEqual);
  assertStringIncludes(js, "10 <= 10");
  assertEquals(true, true);
});

Deno.test("comparison operators - equal", async () => {
  const js = await transpileToJS(SAMPLES.equal);
  // In JavaScript this could be === for strict equality
  assertTrue(js.includes("10 === 10") || js.includes("10==10"));
  assertEquals(true, true);
});

Deno.test("comparison operators - not equal", async () => {
  const js = await transpileToJS(SAMPLES.notEqual);
  // In JavaScript this could be !== for strict inequality
  assertTrue(js.includes("10 !== 5") || js.includes("10!=5"));
  assertEquals(true, true);
});

Deno.test("comparison operators - with variables", async () => {
  const js = await transpileToJS(SAMPLES.withVariables);
  assertStringIncludes(js, "const a = 10");
  assertStringIncludes(js, "const b = 5");
  // Check for various comparison operators with variables
  assertStringIncludes(js, "a > b");
  assertStringIncludes(js, "a < b");
  assertStringIncludes(js, "a >= b");
  assertStringIncludes(js, "a <= b");
  // Equal and not equal might be === and !== in JS
  assertTrue(js.includes("a === b") || js.includes("a==b"));
  assertTrue(js.includes("a !== b") || js.includes("a!=b"));
  assertEquals(true, true);
});

Deno.test("comparison operators - in functions", async () => {
  const js = await transpileToJS(SAMPLES.inFunctions);
  // The function syntax might vary
  assertTrue(js.includes("function") && js.includes("n"));
  assertStringIncludes(js, "n > 0");
  assertEquals(true, true);
});

Deno.test("comparison operators - with logical operators", async () => {
  const js = await transpileToJS(SAMPLES.withLogical);
  assertStringIncludes(js, "10 > 5");
  assertStringIncludes(js, "20 < 30");
  assertEquals(true, true);
});

Deno.test("comparison operators - complex in function", async () => {
  const js = await transpileToJS(SAMPLES.complexInFunction);
  assertStringIncludes(js, "function");
  assertStringIncludes(js, "value");
  assertStringIncludes(js, "min");
  assertStringIncludes(js, "max");
  // Check for the comparison operators
  assertTrue(js.includes("value >= min") && js.includes("value <= max"));
  assertEquals(true, true);
});

// Helper function
function assertTrue(condition: boolean): void {
  assertEquals(condition, true);
}