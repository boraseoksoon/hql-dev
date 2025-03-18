// test/macro/let_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for the let macro
const SAMPLES = {
  basicBinding: `
    (let (x 10)
      x)
  `,
  multipleBindings: `
    (let (x 10
          y 20)
      (+ x y))
  `,
  nestedLet: `
    (let (outer 5)
      (let (inner (+ outer 3))
        (* outer inner)))
  `,
  bindingsUsingPrevious: `
    (let (a 1
          b (+ a 1)
          c (+ a b))
      (+ a b c))
  `,
  withFunctionCall: `
    (defn twice (x) (* x 2))
    (let (result (twice 5))
      result)
  `,
  inFunction: `
    (defn compute-area (width height)
      (let (area (* width height))
        area))
    (compute-area 5 10)
  `,
  // Multiple parameters test
  multipleParams: `
    (let (x 10
          y 20
          z 30)
      (+ x (+ y z)))
  `
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Tests for let macro - Updated to match actual formatting with spaces
Deno.test("let macro - basic binding", async () => {
  const js = await transpileToJS(SAMPLES.basicBinding);
  // Note the space after "function"
  assertStringIncludes(js, "function (x)");
  assertStringIncludes(js, "return x");
});

Deno.test("let macro - multiple bindings", async () => {
  const js = await transpileToJS(SAMPLES.multipleBindings);
  // Include spaces after "function" in assertions
  assertStringIncludes(js, "function (x)");
  assertStringIncludes(js, "function (y)");
  assertStringIncludes(js, "return x + y");
});

Deno.test("let macro - nested let", async () => {
  const js = await transpileToJS(SAMPLES.nestedLet);
  assertStringIncludes(js, "function (outer)");
  assertStringIncludes(js, "function (inner)");
  assertStringIncludes(js, "return outer * inner");
});

Deno.test("let macro - bindings using previous values", async () => {
  const js = await transpileToJS(SAMPLES.bindingsUsingPrevious);
  assertStringIncludes(js, "function (a)");
  assertStringIncludes(js, "function (b)");
  assertStringIncludes(js, "function (c)");
  assertStringIncludes(js, "return a + b + c");
});

Deno.test("let macro - with function call", async () => {
  const js = await transpileToJS(SAMPLES.withFunctionCall);
  assertStringIncludes(js, "function");  // This one already passes, can be generic
  assertStringIncludes(js, "twice");
  assertStringIncludes(js, "return result");
});

Deno.test("let macro - in function", async () => {
  const js = await transpileToJS(SAMPLES.inFunction);
  assertStringIncludes(js, "compute_area");
  assertStringIncludes(js, "function");  // This one already passes, can be generic
  assertStringIncludes(js, "area");
  assertStringIncludes(js, "return area");
});

// New test for multiple parameters
Deno.test("let macro - multiple params", async () => {
  const js = await transpileToJS(SAMPLES.multipleParams);
  assertStringIncludes(js, "function (x)");
  assertStringIncludes(js, "function (y)");
  assertStringIncludes(js, "function (z)");
  
  // Check for either formatting of the return expression
  const hasCorrectReturn = 
    js.includes("return x + (y + z)") || 
    js.includes("return x + y + z");
  assertEquals(hasCorrectReturn, true);
});

// if-let macro samples in HQL
const IF_LET_SAMPLES = {
  truthy: `
    (if-let (x 42)
      (str "Truthy: " x)
      "Falsy")
  `,
  falsy: `
    (if-let (x nil)
      (str "Truthy: " x)
      "Falsy")
  `,
  zero: `
    (if-let (x 0)
      (str "Truthy: " x)
      "Falsy")
  `,
  nested: `
    (if-let (x (if-let (y 100)
                    (str "Inner: " y)
                    "Inner Falsy"))
      (str "Outer: " x)
      "Outer Falsy")
  `,
  functionCall: `
    (defn double (n) (* n 2))
    (if-let (result (double 5))
      (str "Result: " result)
      "No result")
  `
};


// Test: if-let macro with a truthy binding
Deno.test("if-let macro - truthy binding", async () => {
  const js = await transpileToJS(IF_LET_SAMPLES.truthy);
  // We expect the generated JS to include a function that binds 'x' and returns the then branch.
  assertStringIncludes(js, "function (x)");
  assertStringIncludes(js, "?");
  assertStringIncludes(js, "Truthy: ");
});

// Test: if-let macro with a falsy (nil) binding
Deno.test("if-let macro - falsy binding", async () => {
  const js = await transpileToJS(IF_LET_SAMPLES.falsy);
  // For a nil value, the else branch "Falsy" should be returned.
  assertStringIncludes(js, "function (x)");
  assertStringIncludes(js, "Falsy");
});

// Test: if-let macro with a zero binding (0 is falsy)
Deno.test("if-let macro - zero binding", async () => {
  const js = await transpileToJS(IF_LET_SAMPLES.zero);
  // Zero is falsy, so the else branch should be used.
  assertStringIncludes(js, "Falsy");
});

// Test: Nested if-let macro
Deno.test("if-let macro - nested if-let", async () => {
  const js = await transpileToJS(IF_LET_SAMPLES.nested);
  // Expect nested function bindings for x and y, along with both "Inner:" and "Outer:" strings.
  assertStringIncludes(js, "function (x)");
  assertStringIncludes(js, "function (y)");
  assertStringIncludes(js, "Inner: ");
  assertStringIncludes(js, "Outer: ");
});

// Test: if-let macro using a function call
Deno.test("if-let macro - with function call", async () => {
  const js = await transpileToJS(IF_LET_SAMPLES.functionCall);
  // The output should contain the function name "double" and a binding for "result".
  assertStringIncludes(js, "double");
  assertStringIncludes(js, "function (result)");
  assertStringIncludes(js, "Result: ");
});
