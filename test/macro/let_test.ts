// test/macro/let_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-code-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for the let macro
const SAMPLES = {
  basicBinding: `
    (let [x 10]
      x)
  `,
  multipleBindings: `
    (let [x 10
          y 20]
      (+ x y))
  `,
  nestedLet: `
    (let [outer 5]
      (let [inner (+ outer 3)]
        (* outer inner)))
  `,
  bindingsUsingPrevious: `
    (let [a 1
          b (+ a 1)
          c (+ a b)]
      (+ a b c))
  `,
  withFunctionCall: `
    (defn twice [x] (* x 2))
    (let [result (twice 5)]
      result)
  `,
  inFunction: `
    (defn compute-area [width height]
      (let [area (* width height)]
        area))
    (compute-area 5 10)
  `
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Tests for let macro - Updated to match actual implementation
Deno.test("let macro - basic binding", async () => {
  const js = await transpileToJS(SAMPLES.basicBinding);
  // Updated to check for function-based implementation
  assertStringIncludes(js, "function (vector)");
  assertStringIncludes(js, "return x");
  assertStringIncludes(js, ".x");
});

Deno.test("let macro - multiple bindings", async () => {
  const js = await transpileToJS(SAMPLES.multipleBindings);
  // Check for function-based binding and return statement
  assertStringIncludes(js, "function (vector)");
  assertStringIncludes(js, "return x + y");
});

Deno.test("let macro - nested let", async () => {
  const js = await transpileToJS(SAMPLES.nestedLet);
  // Check for nested function expressions
  assertStringIncludes(js, "function (vector)");
  assertStringIncludes(js, "return function (vector)");
  assertStringIncludes(js, "return outer * inner");
});

Deno.test("let macro - bindings using previous values", async () => {
  const js = await transpileToJS(SAMPLES.bindingsUsingPrevious);
  // Check for function with return expression
  assertStringIncludes(js, "function (vector)");
  assertStringIncludes(js, "return a + b + c");
});

Deno.test("let macro - with function call", async () => {
  const js = await transpileToJS(SAMPLES.withFunctionCall);
  // Check for function definition and let usage
  assertStringIncludes(js, "function");
  assertStringIncludes(js, "return x * 2");
  assertStringIncludes(js, "return result");
});

Deno.test("let macro - in function", async () => {
  const js = await transpileToJS(SAMPLES.inFunction);
  // Check for function definition with let inside
  assertStringIncludes(js, "function");
  assertStringIncludes(js, "compute_area");
  assertStringIncludes(js, "return");
  assertStringIncludes(js, "area");
});