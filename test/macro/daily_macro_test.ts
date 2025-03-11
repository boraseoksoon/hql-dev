// test/macro/daily_macro_test.ts
import { assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-code-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Helper function to transpile HQL source to JS.
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

Deno.test("daily macro test - when", async () => {
  const js = await transpileToJS(`
    (def x 10)
    (def when-result
      (when (> x 5)
        (js-call console "log" "x is greater than 5")))
  `);
  // Check for a ternary operator pattern with condition and console call.
  assertStringIncludes(js, "> 5 ?");
  assertStringIncludes(js, "console.log(\"x is greater than 5\")");
});

Deno.test("daily macro test - unless", async () => {
  const js = await transpileToJS(`
    (def x 10)
    (def unless-result
      (unless (< x 5)
        (js-call console "log" "x is not less than 5")))
  `);
  // Check for a ternary pattern with a null branch.
  assertStringIncludes(js, "< 5 ?");
  assertStringIncludes(js, "null : function");
  assertStringIncludes(js, "console.log(\"x is not less than 5\")");
});

Deno.test("daily macro test - inc", async () => {
  const js = await transpileToJS(`
    (def inc-result (inc 5))
  `);
  // The inc macro expands to (+ 5 1)
  assertStringIncludes(js, "5 + 1");
});

Deno.test("daily macro test - dec", async () => {
  const js = await transpileToJS(`
    (def dec-result (dec 5))
  `);
  // The dec macro expands to (- 5 1)
  assertStringIncludes(js, "5 - 1");
});
