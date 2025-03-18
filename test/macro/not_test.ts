// test/macro/not_test.ts
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for the not macro
const SAMPLES = {
  notTrue: `(not true)`,
  notFalse: `(not false)`,
  notExpression: `(not (> 5 3))`,
  notZero: `(not 0)`,
  notOne: `(not 1)`,
  notString: `(not "hello")`,
  notEmptyString: `(not "")`,
  notComplex: `(not (do (def x 10) (< x 5)))`,
  doubleNot: `(not (not true))`
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Tests for not macro
Deno.test("not macro - not true", async () => {
  const js = await transpileToJS(SAMPLES.notTrue);
  assertEquals(js.includes("true ? 0 : 1"), true);
});

Deno.test("not macro - not false", async () => {
  const js = await transpileToJS(SAMPLES.notFalse);
  assertEquals(js.includes("false ? 0 : 1"), true);
});

Deno.test("not macro - not expression", async () => {
  const js = await transpileToJS(SAMPLES.notExpression);
  assertEquals(js.includes("5 > 3"), true);
  assertEquals(js.includes("? 0 : 1"), true);
});

Deno.test("not macro - not 0", async () => {
  const js = await transpileToJS(SAMPLES.notZero);
  assertEquals(js.includes("0 ? 0 : 1"), true);
});

Deno.test("not macro - not 1", async () => {
  const js = await transpileToJS(SAMPLES.notOne);
  assertEquals(js.includes("1 ? 0 : 1"), true);
});

Deno.test("not macro - not string", async () => {
  const js = await transpileToJS(SAMPLES.notString);
  assertEquals(js.includes("\"hello\" ? 0 : 1"), true);
});

Deno.test("not macro - not empty string", async () => {
  const js = await transpileToJS(SAMPLES.notEmptyString);
  assertEquals(js.includes("\"\" ? 0 : 1"), true);
});

Deno.test("not macro - not complex expression", async () => {
    const js = await transpileToJS(SAMPLES.notComplex);
    assertEquals(js.includes("const x = 10"), true);
    assertEquals(js.includes("x < 5"), true);
    assertEquals(js.includes("?"), true);
    assertEquals(
      js.includes("0 : 1") || js.includes("!") || js.includes("==="), 
      true
    );
  });
  
  Deno.test("not macro - double not", async () => {
    const js = await transpileToJS(SAMPLES.doubleNot);
    assertEquals(js.includes("true"), true);

    assertEquals(
      js.includes("?") || js.includes("!") || js.includes("==="), 
      true
    );
  });