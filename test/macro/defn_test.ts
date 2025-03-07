// test/macros/defn_test.ts
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-to-ir.ts";
import { convertIRToTSAST } from "../../src/transpiler/ir-to-ts-ast.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for the defn macro
const DEFN_SAMPLES = {
  // Basic function with single parameter
  basic: `
    (defn increment (x) (+ x 1))
    (increment 5)
  `,
  
  // Function with multiple parameters
  multiParam: `
    (defn add-three (x y z) (+ (+ x y) z))
    (add-three 1 2 3)
  `,
  
  // Function with no parameters
  noParams: `
    (defn get-ten () 10)
    (get-ten)
  `,
  
  // Function with body that uses do
  withDo: `
    (defn calculate (x y)
      (do
        (def sum (+ x y))
        (def product (* x y))
        (+ sum product)))
    (calculate 3 4)
  `,
  
  // Function with conditional logic
  withConditional: `
    (defn max-value (a b)
      (if (> a b) a b))
    (max-value 10 5)
  `,
  
  // Recursive function
  recursive: `
    (defn factorial (n)
      (if (<= n 1)
          1
          (* n (factorial (- n 1)))))
    (factorial 5)
  `,
  
  // Function that defines an inner function
  innerFunction: `
    (defn outer (x)
      (defn inner (y) (* y y))
      (inner x))
    (outer 4)
  `
};

// Transpile HQL to JavaScript
async function transpileHQL(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  const tsAst = convertIRToTSAST(ir);
  return generateTypeScript(tsAst);
}

// Execute the transpiled JavaScript
function executeJS(jsCode: string): any {
  const fn = new Function("return " + jsCode);
  return fn();
}

Deno.test("defn macro - basic function", async () => {
  const js = await transpileHQL(DEFN_SAMPLES.basic);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, 6);
});

Deno.test("defn macro - function with multiple parameters", async () => {
  const js = await transpileHQL(DEFN_SAMPLES.multiParam);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, 6);
});

Deno.test("defn macro - function with no parameters", async () => {
  const js = await transpileHQL(DEFN_SAMPLES.noParams);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, 10);
});

Deno.test("defn macro - function with do", async () => {
  const js = await transpileHQL(DEFN_SAMPLES.withDo);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, 19); // (3 + 4) + (3 * 4) = 7 + 12 = 19
});

Deno.test("defn macro - function with conditional", async () => {
  const js = await transpileHQL(DEFN_SAMPLES.withConditional);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, 10);
});

Deno.test("defn macro - recursive function", async () => {
  const js = await transpileHQL(DEFN_SAMPLES.recursive);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, 120); // 5! = 120
});

Deno.test("defn macro - function with inner function", async () => {
  const js = await transpileHQL(DEFN_SAMPLES.innerFunction);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, 16); // 4² = 16
});