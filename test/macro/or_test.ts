// test/macro/or_test.ts
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-code-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for the or macro
const SAMPLES = {
  trueOrTrue: `(or true true)`,
  trueOrFalse: `(or true false)`,
  falseOrTrue: `(or false true)`,
  falseOrFalse: `(or false false)`,
  expressions: `(or (< 5 3) (< 10 20))`,
  nonBoolean: `(or "a" "b")`,
  falsyOrString: `(or false "fallback")`,
  complex: `(or (do (def x 10) (< x 5)) (do (def y 20) (< y 30)))`,
  chained: `(or (or false false) (or false true))`
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Tests for or macro
Deno.test("or macro - true or true", async () => {
  const js = await transpileToJS(SAMPLES.trueOrTrue);
  assertEquals(js.includes("true ? true : true"), true);
});

Deno.test("or macro - true or false", async () => {
  const js = await transpileToJS(SAMPLES.trueOrFalse);
  assertEquals(js.includes("true ? true : false"), true);
});

Deno.test("or macro - false or true", async () => {
  const js = await transpileToJS(SAMPLES.falseOrTrue);
  assertEquals(js.includes("false ? false : true"), true);
});

Deno.test("or macro - false or false", async () => {
  const js = await transpileToJS(SAMPLES.falseOrFalse);
  assertEquals(js.includes("false ? false : false"), true);
});

Deno.test("or macro - with expressions", async () => {
  const js = await transpileToJS(SAMPLES.expressions);
  assertEquals(js.includes("5 < 3"), true);
  assertEquals(js.includes("10 < 20"), true);
});

Deno.test("or macro - with non-boolean values", async () => {
  const js = await transpileToJS(SAMPLES.nonBoolean);
  assertEquals(js.includes("\"a\" ? \"a\" : \"b\""), true);
});

Deno.test("or macro - falsy or string", async () => {
  const js = await transpileToJS(SAMPLES.falsyOrString);
  assertEquals(js.includes("false ? false : \"fallback\""), true);
});

Deno.test("or macro - with complex expressions", async () => {
    const js = await transpileToJS(SAMPLES.complex);
    assertEquals(js.includes("const x = 10"), true);
    assertEquals(js.includes("x < 5"), true);
    assertEquals(js.includes("const y = 20"), true);
    assertEquals(js.includes("y < 30"), true);
    assertEquals(js.includes("?"), true);
  });

Deno.test("or macro - chained ors", async () => {
  const js = await transpileToJS(SAMPLES.chained);
  assertEquals(js.includes("false ? false : false"), true);
  assertEquals(js.includes("false ? false : true"), true);
});