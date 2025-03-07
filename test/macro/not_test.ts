// test/macros/not_test.ts
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-to-ir.ts";
import { convertIRToTSAST } from "../../src/transpiler/ir-to-ts-ast.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for the not macro
const NOT_SAMPLES = {
  // Basic not true
  notTrue: `(not true)`,
  
  // Basic not false
  notFalse: `(not false)`,
  
  // Not with expression
  expression: `(not (> 5 3))`,
  
  // Not with 0 (falsy)
  notZero: `(not 0)`,
  
  // Not with 1 (truthy)
  notOne: `(not 1)`,
  
  // Not with string (truthy)
  notString: `(not "hello")`,
  
  // Not with empty string (falsy in JS, but truthy in HQL)
  notEmptyString: `(not "")`,
  
  // Not with null (falsy)
  notNull: `(not null)`,
  
  // Not with complex expression
  complex: `(not (do (def x 10) (< x 5)))`,
  
  // Double negation
  doubleNot: `(not (not true))`
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

Deno.test("not macro - not true", async () => {
  const js = await transpileHQL(NOT_SAMPLES.notTrue);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, 0); // 0 is false representation in HQL
});

Deno.test("not macro - not false", async () => {
  const js = await transpileHQL(NOT_SAMPLES.notFalse);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, 1); // 1 is true representation in HQL
});

Deno.test("not macro - not expression", async () => {
  const js = await transpileHQL(NOT_SAMPLES.expression);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, 0); // 5 > 3 is true, so not(true) is 0
});

Deno.test("not macro - not 0", async () => {
  const js = await transpileHQL(NOT_SAMPLES.notZero);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, 1); // not 0 (falsy) is 1
});

Deno.test("not macro - not 1", async () => {
  const js = await transpileHQL(NOT_SAMPLES.notOne);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, 0); // not 1 (truthy) is 0
});

Deno.test("not macro - not string", async () => {
  const js = await transpileHQL(NOT_SAMPLES.notString);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, 0); // not "hello" (truthy) is 0
});

Deno.test("not macro - not complex expression", async () => {
  const js = await transpileHQL(NOT_SAMPLES.complex);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, 1); // x = 10, x < 5 is false, so not(false) is 1
});

Deno.test("not macro - double not", async () => {
  const js = await transpileHQL(NOT_SAMPLES.doubleNot);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, 1); // not(not(true)) = not(0) = 1
});