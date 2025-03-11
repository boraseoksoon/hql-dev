// Updated test/interop/dot_accessor_test.ts

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-code-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for chained function calls
const SAMPLES = {
  // Method chains
  arrayManipulation: `
    (def arr [1, 2, 3, 4, 5])
    (def filtered (arr.filter (fn (x) (> x 2))))
    (def mapped (filtered.map (fn (x) (* x 2))))
  `,
  
  // Object method chains
  dateFormatting: `
    (def today (new Date))
    (def iso-string (today.toISOString))
    (def date-part (iso-string.substring 0 10))
  `,
  
  // Nested function calls
  nestedCalls: `
    (def nums [1, 2, 3, 4, 5])
    (def sum (nums.reduce (fn (a b) (+ a b)) 0))
    (def max (Math.max sum 10))
  `,
  
  // Multiple dot notation calls in a sequence
  sequentialCalls: `
    (def obj {"nested": {"value": {"data": 42}}})
    (def val1 (obj.nested))
    (def val2 (val1.value))
    (def result (val2.data))
  `,
  
  // Function returning object, then accessing property
  returnObjectThenAccess: `
    (defn get-obj () {"value": 42})
    (def obj (get-obj))
    (def value (obj.value))
  `,
  
  // Nested expressions with function calls
  complexExpression: `
    (def nums [10, 20, 30, 40, 50])
    (def len (nums.length))
    (def result (+ len (* 2 (Math.max 5 10))))
  `,

  // Method call inside another function
  methodInFunction: `
    (def message "hello world")
    (def msg-len (message.length))
    (def len (Math.max msg-len 5))
  `,
  
  // Multiple method calls on the same object
  multipleMethodCalls: `
    (def text " Hello World! ")
    (def trimmed (text.trim))
    (def lower (trimmed.toLowerCase))
    (def result (lower.replace "hello" "hi"))
  `
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Tests for chained function calls
Deno.test("chained calls - array manipulation", async () => {
  const js = await transpileToJS(SAMPLES.arrayManipulation);
  assertStringIncludes(js, "const arr = [1, 2, 3, 4, 5]");
  assertStringIncludes(js, "const filtered = ");
  assertStringIncludes(js, "filter");
  assertStringIncludes(js, "x > 2");
  assertStringIncludes(js, "const mapped = ");
  assertStringIncludes(js, "map");
  assertStringIncludes(js, "x * 2");
});

Deno.test("chained calls - date formatting", async () => {
  const js = await transpileToJS(SAMPLES.dateFormatting);
  // Updated to match the actual output format
  assertStringIncludes(js, "const today = new Date()");
  assertStringIncludes(js, "const iso_string = ");
  assertStringIncludes(js, "toISOString");
  assertStringIncludes(js, "const date_part = ");
  assertStringIncludes(js, "substring");
});

Deno.test("chained calls - nested function calls", async () => {
  const js = await transpileToJS(SAMPLES.nestedCalls);
  assertStringIncludes(js, "const nums = [1, 2, 3, 4, 5]");
  assertStringIncludes(js, "const sum = ");
  assertStringIncludes(js, "reduce");
  assertStringIncludes(js, "a + b");
  assertStringIncludes(js, "const max = Math.max(sum, 10)");
});

Deno.test("chained calls - sequential calls", async () => {
  const js = await transpileToJS(SAMPLES.sequentialCalls);
  assertStringIncludes(js, "const obj = {");
  assertStringIncludes(js, "nested: {");
  assertStringIncludes(js, "value: {");
  assertStringIncludes(js, "data: 42");
  assertStringIncludes(js, "const val1 = ");
  assertStringIncludes(js, "const val2 = ");
  assertStringIncludes(js, "const result = ");
});

Deno.test("chained calls - function returning object then property access", async () => {
    const js = await transpileToJS(SAMPLES.returnObjectThenAccess);
    console.log("js:", js);
    
    // Check for function definition without specifying exact format
    const hasFunction = js.includes("get_obj") && js.includes("function");
    assertEquals(hasFunction, true);
    
    assertStringIncludes(js, "return {");
    assertStringIncludes(js, "value: 42");
    assertStringIncludes(js, "const obj = get_obj()");
    
    // Update to check for direct property access pattern instead of IIFE
    assertStringIncludes(js, "const value = obj.value");
  });

  Deno.test("chained calls - complex expression", async () => {
    const js = await transpileToJS(SAMPLES.complexExpression);
    assertStringIncludes(js, "const nums = [10, 20, 30, 40, 50]");
    
    // Update to check for direct property access pattern
    assertStringIncludes(js, "const len = nums.length");
    assertStringIncludes(js, "const result = ");
    assertStringIncludes(js, "Math.max(5, 10)");
  });
  

  Deno.test("chained calls - method in function", async () => {
    const js = await transpileToJS(SAMPLES.methodInFunction);
    assertStringIncludes(js, "const message = \"hello world\"");
    assertStringIncludes(js, "const msg_len = message.length");
    assertStringIncludes(js, "const len = Math.max(msg_len, 5)");
  });

Deno.test("chained calls - multiple method calls", async () => {
  const js = await transpileToJS(SAMPLES.multipleMethodCalls);
  assertStringIncludes(js, "const text = \" Hello World! \"");
  assertStringIncludes(js, "const trimmed = ");
  assertStringIncludes(js, "trim");
  assertStringIncludes(js, "const lower = ");
  assertStringIncludes(js, "toLowerCase");
  assertStringIncludes(js, "const result = ");
  assertStringIncludes(js, "replace");
});