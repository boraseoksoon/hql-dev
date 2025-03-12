// test/macro/daily_macro_test.ts - Extended with tests for core primitives
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

// Existing tests for basic macros
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

// New tests for symbol-related functions and other core primitives

Deno.test("daily macro test - symbol?", async () => {
  const js = await transpileToJS(`
    (def sym 'hello)
    (def is-symbol (symbol? sym))
  `);
  assertStringIncludes(js, "const sym = \"hello\"");
  assertStringIncludes(js, "const is_symbol = symbol_pred(sym)");
});

Deno.test("daily macro test - list?", async () => {
  const js = await transpileToJS(`
    (def lst '(1 2 3))
    (def is-list (list? lst))
  `);
  assertStringIncludes(js, "const lst = [1, 2, 3]");
  assertStringIncludes(js, "const is_list = list_pred(lst)");
});

Deno.test("daily macro test - map?", async () => {
  const js = await transpileToJS(`
    (def mp {"name" : "John"})
    (def is-map (map? mp))
  `);
  assertStringIncludes(js, "const mp = {");
  assertStringIncludes(js, "name: \"John\"");
  assertStringIncludes(js, "const is_map = map_pred(mp)");
});

Deno.test("daily macro test - nil?", async () => {
  const js = await transpileToJS(`
    (def n nil)
    (def is-nil (nil? n))
  `);
  assertStringIncludes(js, "const n = null");
  assertStringIncludes(js, "const is_nil = nil_pred(n)");
});

Deno.test("daily macro test - first, rest, next", async () => {
  const js = await transpileToJS(`
    (def numbers '(1 2 3 4 5))
    (def first-item (first numbers))
    (def rest-items (rest numbers))
    (def next-items (next numbers))
  `);
  assertStringIncludes(js, "const numbers = [1, 2, 3, 4, 5]");
  assertStringIncludes(js, "const first_item = first(numbers)");
  assertStringIncludes(js, "const rest_items = rest(numbers)");
  assertStringIncludes(js, "const next_items = next(numbers)");
});

Deno.test("daily macro test - seq and empty?", async () => {
  const js = await transpileToJS(`
    (def empty-list '())
    (def non-empty '(1 2 3))
    (def seq-result (seq non-empty))
    (def is-empty (empty? empty-list))
    (def is-not-empty (empty? non-empty))
  `);
  assertStringIncludes(js, "const empty_list = []");
  assertStringIncludes(js, "const non_empty = [1, 2, 3]");
  assertStringIncludes(js, "const seq_result = seq(non_empty)");
  assertStringIncludes(js, "const is_empty = empty_pred(empty_list)");
  assertStringIncludes(js, "const is_not_empty = empty_pred(non_empty)");
});

Deno.test("daily macro test - conj and concat", async () => {
  const js = await transpileToJS(`
    (def xs '(1 2 3))
    (def ys '(4 5 6))
    (def conj-result (conj xs 4))
    (def concat-result (concat xs ys))
    (def multi-concat (concat xs '() ys))
  `);
  assertStringIncludes(js, "const xs = [1, 2, 3]");
  assertStringIncludes(js, "const ys = [4, 5, 6]");
  assertStringIncludes(js, "const conj_result = conj(xs, 4)");
  assertStringIncludes(js, "const concat_result = concat(xs, ys)");
  assertStringIncludes(js, "const multi_concat = concat(xs, [], ys)");
});