// test/macros/or_test.ts
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-to-ir.ts";
import { convertIRToTSAST } from "../../src/transpiler/ir-to-ts-ast.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for the or macro
const OR_SAMPLES = {
  // Basic true or true
  trueOrTrue: `(or true true)`,
  
  // Basic true or false
  trueOrFalse: `(or true false)`,
  
  // Basic false or true
  falseOrTrue: `(or false true)`,
  
  // Basic false or false
  falseOrFalse: `(or false false)`,
  
  // With expressions
  expressions: `(or (< 5 3) (< 10 20))`,
  
  // With strings (non-boolean values)
  nonBoolean: `(or "a" "b")`,
  
  // With falsy value and string
  falsyOrString: `(or false "fallback")`,
  
  // With complex expressions
  complex: `(or (do (def x 10) (< x 5)) (do (def y 20) (< y 30)))`,
  
  // Chained ors
  chained: `(or (or false false) (or false true))`
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

Deno.test("or macro - true or true", async () => {
  const js = await transpileHQL(OR_SAMPLES.trueOrTrue);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true);
});

Deno.test("or macro - true or false", async () => {
  const js = await transpileHQL(OR_SAMPLES.trueOrFalse);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true);
});

Deno.test("or macro - false or true", async () => {
  const js = await transpileHQL(OR_SAMPLES.falseOrTrue);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true);
});

Deno.test("or macro - false or false", async () => {
  const js = await transpileHQL(OR_SAMPLES.falseOrFalse);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, false);
});

Deno.test("or macro - with expressions", async () => {
  const js = await transpileHQL(OR_SAMPLES.expressions);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true);
});

Deno.test("or macro - with non-boolean values", async () => {
  const js = await transpileHQL(OR_SAMPLES.nonBoolean);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, "a");
});

Deno.test("or macro - falsy or string", async () => {
  const js = await transpileHQL(OR_SAMPLES.falsyOrString);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, "fallback");
});

Deno.test("or macro - with complex expressions", async () => {
  const js = await transpileHQL(OR_SAMPLES.complex);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true);
});

Deno.test("or macro - chained ors", async () => {
  const js = await transpileHQL(OR_SAMPLES.chained);
  console.log("Generated JS:", js);
  const result = executeJS(js);
  assertEquals(result, true);
});