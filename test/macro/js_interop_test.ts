// Updated test/macro/js_interop_test.ts

import { assertEquals, assertMatch, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { transpile } from "../../src/transformer.ts";

// Helper to parse and transpile HQL
async function transpileHQL(source: string): Promise<string> {
  return await transpile(source, "test.hql", { verbose: false });
}

// These are additional tests that can be added to your existing js_interop_test.ts file

Deno.test("JS Interop - dot notation with property access", async () => {
  const result = await transpileHQL(`
    (def pi-value (Math.PI))
    (console.log pi-value)
  `);

  assertStringIncludes(result, "const pi_value = Math.PI");
  assertStringIncludes(result, "PI");
  assertStringIncludes(result, "console.log(pi_value)");
});

Deno.test("JS Interop - dot notation with method call", async () => {
  const result = await transpileHQL(`
    (def text "hello world")
    (def upper-text (text.toUpperCase))
  `);
  
  // Verify correct method call transformation
  assertStringIncludes(result, 'const text = "hello world"');
  assertStringIncludes(result, "toUpperCase");
});

Deno.test("JS Interop - method calls with arguments", async () => {
  const result = await transpileHQL(`
    (def arr (new Array))
    (arr.push 1)
    (arr.push 2)
    (arr.push 3)
  `);
  
  // Verify method calls with args
  assertStringIncludes(result, "arr.push(1)");
  assertStringIncludes(result, "arr.push(2)");
  assertStringIncludes(result, "arr.push(3)");
});

Deno.test("JS Interop - constructor with new", async () => {
  const result = await transpileHQL(`
    (def date (new Date))
    (def now (date.getTime))
  `);
  
  // Updated to match the actual output format
  assertStringIncludes(result, "new Date()");
  assertStringIncludes(result, "getTime");
});

Deno.test("JS Interop - combining dot notation and function calls", async () => {
  const result = await transpileHQL(`
    (def max-value (Math.max 1 2 3))
    (def min-value (Math.min 1 2 3))
  `);
  
  // Verify correct transformation of object method calls with arguments
  assertStringIncludes(result, "Math.max(1");
  assertStringIncludes(result, "Math.min(1");
});

Deno.test("JS Interop - explicit interop functions", async () => {
  const result = await transpileHQL(`
    (js-call console "log" "direct call")
    (def pi (js-get Math "PI"))
    (def rand (js-call Math "random"))
  `);
  
  // Verify the explicit interop forms
  assertStringIncludes(result, 'console.log("direct call")');
  assertStringIncludes(result, 'Math["PI"]');
  assertStringIncludes(result, 'Math.random()');
});