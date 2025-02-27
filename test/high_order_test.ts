// test/higher_order_test.ts
import { parse } from "../src/transpiler/parser.ts";
import { transformAST } from "../src/transpiler/transformer.ts";
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";

// Helper function to parse and transform HQL code
async function transformHQL(hql: string): Promise<string> {
  const ast = parse(hql);
  return await transformAST(ast, Deno.cwd(), new Set());
}

// Helper function to remove whitespace and normalize for comparison
function normalizeJS(js: string): string {
  return js.replace(/\s+/g, ' ').trim();
}

// Test specifically for the makeAdder function
Deno.test("makeAdder higher-order function", async () => {
  const hql = `
    (defn make-adder (increment: Number)
      (fn (x) (+ x increment)))
    (def add5 (make-adder increment: 5))
    (print (add5 10))
  `;
  
  const js = await transformHQL(hql);
  console.log("Generated JS:", js);
  
  // Now validate specific parts of the output
  const hasReturnFunction = js.includes("return function(x)");
  assertEquals(hasReturnFunction, true, "Missing 'return function' in makeAdder");
  
  const hasReturnBody = js.includes("return (x + increment)");
  assertEquals(hasReturnBody, true, "Missing return statement in inner function");
  
  const hasValidFunctionCall = js.includes("const add5 = makeAdder({ increment: 5 })");
  assertEquals(hasValidFunctionCall, true, "Invalid function call for makeAdder");
});

// Test a multi-level higher-order function 
Deno.test("Multi-level higher-order function", async () => {
  const hql = `
    (defn create-counter (initial: Number)
      (fn ()
        (fn (increment: Number)
          (+ initial increment))))
    (def counter-creator (create-counter initial: 10))
    (def counter (counter-creator))
    (print (counter increment: 5))
  `;
  
  const js = await transformHQL(hql);
  console.log("Generated multi-level JS:", js);
  
  // Verify the structure of nested returns
  const hasFirstReturn = js.includes("return function()");
  assertEquals(hasFirstReturn, true, "Missing first level 'return function'");
  
  const hasSecondReturn = js.includes("return function(params)") || 
                          js.includes("return function(increment)");
  assertEquals(hasSecondReturn, true, "Missing second level 'return function'");
});

// Run the test directly if this file is executed
if (import.meta.main) {
  await Deno.test("makeAdder higher-order function");
  await Deno.test("Multi-level higher-order function");
}