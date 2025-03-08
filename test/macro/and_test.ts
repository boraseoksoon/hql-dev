// test/macro/and_test.ts
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-code-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Sample HQL expressions for testing 'and' macro
const SAMPLES = {
  trueAndTrue: `(and true true)`,
  trueAndFalse: `(and true false)`,
  falseAndTrue: `(and false true)`,
  falseAndFalse: `(and false false)`,
  expressions: `(and (> 5 3) (< 10 20))`,
  nonBoolean: `(and "a" "b")`,
  complex: `(and (do (def x 10) (> x 5)) (do (def y 20) (< y 30)))`,
  chained: `(and (and true true) (and true false))`
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Helper to execute JavaScript code
function executeJS(jsCode: string): any {
  try {
    // Create a runtime function for list
    const runtime = "function list(...args) { return args; };\n";
    return (new Function(runtime + jsCode + "; return null;"))();
  } catch (error) {
    console.error("Error executing JS:", error);
    throw error;
  }
}

// Test cases for 'and' macro
Deno.test("and macro - true and true", async () => {
  const js = await transpileToJS(SAMPLES.trueAndTrue);
  const containsExpectedCode = js.includes("true ? true : true");
  assertEquals(containsExpectedCode, true);
});

Deno.test("and macro - true and false", async () => {
  const js = await transpileToJS(SAMPLES.trueAndFalse);
  const containsExpectedCode = js.includes("true ? false : true");
  assertEquals(containsExpectedCode, true);
});

Deno.test("and macro - false and true", async () => {
  const js = await transpileToJS(SAMPLES.falseAndTrue);
  const containsExpectedCode = js.includes("false ? true : false");
  assertEquals(containsExpectedCode, true);
});

Deno.test("and macro - false and false", async () => {
  const js = await transpileToJS(SAMPLES.falseAndFalse);
  const containsExpectedCode = js.includes("false ? false : false");
  assertEquals(containsExpectedCode, true);
});

Deno.test("and macro - with expressions", async () => {
  const js = await transpileToJS(SAMPLES.expressions);
  assertEquals(js.includes("5 > 3"), true);
  assertEquals(js.includes("10 < 20"), true);
});

Deno.test("and macro - with complex expressions", async () => {
    const js = await transpileToJS(SAMPLES.complex);
    assertEquals(js.includes("const x = 10"), true);
    assertEquals(js.includes("x > 5"), true);
    assertEquals(js.includes("const y = 20"), true);
    assertEquals(js.includes("y < 30"), true);
    assertEquals(js.includes("?"), true);
  });

Deno.test("and macro - chained ands", async () => {
  const js = await transpileToJS(SAMPLES.chained);
  assertEquals(js.includes("true ? true : true"), true);
  assertEquals(js.includes("true ? false : true"), true);
});