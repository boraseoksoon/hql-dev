// test/macros/and_test.ts
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-to-ir.ts";
import { convertIRToTSAST } from "../../src/transpiler/ir-to-ts-ast.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for the and macro
const AND_SAMPLES = {
  // Basic true and true
  trueAndTrue: `(and true true)`,
  
  // Basic true and false
  trueAndFalse: `(and true false)`,
  
  // Basic false and true
  falseAndTrue: `(and false true)`,
  
  // Basic false and false
  falseAndFalse: `(and false false)`,
  
  // With expressions
  expressions: `(and (> 5 3) (< 10 20))`,
  
  // With strings (non-boolean values)
  nonBoolean: `(and "a" "b")`,
  
  // With complex expressions
  complex: `(and (do (def x 10) (> x 5)) (do (def y 20) (< y 30)))`,
  
  // Chained ands
  chained: `(and (and true true) (and true false))`
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

Deno.test("and macro - true and true", async () => {
  const js = await transpileHQL(AND_SAMPLES.trueAndTrue);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true);
});

Deno.test("and macro - true and false", async () => {
  const js = await transpileHQL(AND_SAMPLES.trueAndFalse);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, false);
});

Deno.test("and macro - false and true", async () => {
  const js = await transpileHQL(AND_SAMPLES.falseAndTrue);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, false);
});

Deno.test("and macro - false and false", async () => {
  const js = await transpileHQL(AND_SAMPLES.falseAndFalse);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, false);
});

Deno.test("and macro - with expressions", async () => {
  const js = await transpileHQL(AND_SAMPLES.expressions);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true);
});

Deno.test("and macro - with non-boolean values", async () => {
  const js = await transpileHQL(AND_SAMPLES.nonBoolean);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, "b");
});

Deno.test("and macro - with complex expressions", async () => {
  const js = await transpileHQL(AND_SAMPLES.complex);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true);
});

Deno.test("and macro - chained ands", async () => {
  const js = await transpileHQL(AND_SAMPLES.chained);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, false);
});