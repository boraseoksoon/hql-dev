// test/operators/comparison_operators_test.ts
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-to-ir.ts";
import { convertIRToTSAST } from "../../src/transpiler/ir-to-ts-ast.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for comparison operators
const COMPARISON_SAMPLES = {
  // Greater than
  greaterThan: `(> 10 5)`,
  
  // Less than
  lessThan: `(< 5 10)`,
  
  // Greater than or equal
  greaterThanEqual: `(>= 10 10)`,
  
  // Less than or equal
  lessThanEqual: `(<= 10 10)`,
  
  // Equal
  equal: `(= 10 10)`,
  
  // Not equal
  notEqual: `(!= 10 5)`,
  
  // With variables
  withVariables: `
    (def a 10)
    (def b 5)
    (list (> a b) (< a b) (>= a b) (<= a b) (= a b) (!= a b))
  `,
  
  // In functions
  inFunctions: `
    (defn is-positive (n)
      (> n 0))
    (is-positive 5)
  `,
  
  // With logical operators
  withLogical: `
    (and (> 10 5) (< 20 30))
  `,
  
  // Complex comparison in a function
  complexInFunction: `
    (defn in-range (value min max)
      (and (>= value min) (<= value max)))
    (list (in-range 15 10 20) (in-range 5 10 20) (in-range 25 10 20))
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

Deno.test("comparison operators - greater than", async () => {
  const js = await transpileHQL(COMPARISON_SAMPLES.greaterThan);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true);
});

Deno.test("comparison operators - less than", async () => {
  const js = await transpileHQL(COMPARISON_SAMPLES.lessThan);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true);
});

Deno.test("comparison operators - greater than or equal", async () => {
  const js = await transpileHQL(COMPARISON_SAMPLES.greaterThanEqual);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true);
});

Deno.test("comparison operators - less than or equal", async () => {
  const js = await transpileHQL(COMPARISON_SAMPLES.lessThanEqual);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true);
});

Deno.test("comparison operators - equal", async () => {
  const js = await transpileHQL(COMPARISON_SAMPLES.equal);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true);
});

Deno.test("comparison operators - not equal", async () => {
  const js = await transpileHQL(COMPARISON_SAMPLES.notEqual);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true);
});

Deno.test("comparison operators - with variables", async () => {
  const js = await transpileHQL(COMPARISON_SAMPLES.withVariables);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result[0], true);  // a > b
  assertEquals(result[1], false); // a < b
  assertEquals(result[2], true);  // a >= b
  assertEquals(result[3], false); // a <= b
  assertEquals(result[4], false); // a = b
  assertEquals(result[5], true);  // a != b
});

Deno.test("comparison operators - in functions", async () => {
  const js = await transpileHQL(COMPARISON_SAMPLES.inFunctions);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true); // is-positive 5
});

Deno.test("comparison operators - with logical operators", async () => {
  const js = await transpileHQL(COMPARISON_SAMPLES.withLogical);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true); // 10 > 5 and 20 < 30
});

Deno.test("comparison operators - complex in function", async () => {
  const js = await transpileHQL(COMPARISON_SAMPLES.complexInFunction);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result[0], true);  // 15 is in range 10-20
  assertEquals(result[1], false); // 5 is not in range 10-20
  assertEquals(result[2], false); // 25 is not in range 10-20
});