// test/data_structures/empty_literals_test.ts - Fixed assertions to match output format

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for empty data structure literals
const SAMPLES = {
  emptyVector: `(def empty-vec [])`,
  emptyList: `(def empty-list '())`,
  emptyMap: `(def empty-map {})`,
  emptySet: `(def empty-set #[])`,
  
  // Also test non-empty cases to ensure those still work
  nonEmptyVector: `(def some-vec [1, 2, 3])`,
  nonEmptyMap: `(def some-map {"a": 1, "b": 2})`,
  nonEmptySet: `(def some-set #[1, 2, 3])`,
  
  // Test using empty data structures
  usingEmptyVector: `
    (def v [])
    (def has-items (> (length v) 0))
  `,
  
  usingEmptyMap: `
    (def m {})
    (def m-with-key (hash-map "key" "value"))
  `,
  
  usingEmptySet: `
    (def s #[])
    (def s-with-item (hash-set 1))
  `,
  
  // Test scenarios with functions
  passingEmptyStructures: `
    (defn process-data (items map)
      (if (= (length items) 0)
          "empty items"
          "has items"))
    (process-data [] {})
  `,
  
  // Test nested empty structures
  nestedEmpty: `
    (def complex-data {
      "empty-array": [],
      "empty-map": {},
      "empty-set": #[],
      "mixed": [[] {} #[]]
    })
  `,
  
  // Test all together
  combined: `
    (def empty-vec [])
    (def empty-map {})
    (def empty-set #[])
    (def empty-list '())
    (def results [empty-vec empty-map empty-set empty-list])
  `
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Tests for empty data structure literals
Deno.test("empty literals - vector", async () => {
  const js = await transpileToJS(SAMPLES.emptyVector);
  assertStringIncludes(js, "const empty_vec = []");
});

Deno.test("empty literals - map", async () => {
  const js = await transpileToJS(SAMPLES.emptyMap);
  assertStringIncludes(js, "const empty_map = {}");
});

Deno.test("empty literals - set", async () => {
  const js = await transpileToJS(SAMPLES.emptySet);
  assertStringIncludes(js, "const empty_set = new Set");
  // Could be either new Set() or new Set([])
});

Deno.test("empty literals - list", async () => {
  const js = await transpileToJS(SAMPLES.emptyList);
  // Should convert to empty array
  assertStringIncludes(js, "const empty_list = []");
});

// Test non-empty cases
Deno.test("non-empty literals - vector", async () => {
  const js = await transpileToJS(SAMPLES.nonEmptyVector);
  assertStringIncludes(js, "const some_vec = [1, 2, 3]");
});

Deno.test("non-empty literals - map", async () => {
  const js = await transpileToJS(SAMPLES.nonEmptyMap);
  assertStringIncludes(js, "const some_map = {");
  // Fixed to match actual output format (unquoted property names)
  assertStringIncludes(js, "a: 1");
  assertStringIncludes(js, "b: 2");
});

Deno.test("non-empty literals - set", async () => {
  const js = await transpileToJS(SAMPLES.nonEmptySet);
  assertStringIncludes(js, "const some_set = new Set([1, 2, 3])");
});

// Test using empty data structures
Deno.test("using empty vector", async () => {
  const js = await transpileToJS(SAMPLES.usingEmptyVector);
  assertStringIncludes(js, "const v = []");
});

Deno.test("using empty map", async () => {
  const js = await transpileToJS(SAMPLES.usingEmptyMap);
  assertStringIncludes(js, "const m = {}");
  assertStringIncludes(js, "const m_with_key = {");
  assertStringIncludes(js, "key");
  assertStringIncludes(js, "value");
});

Deno.test("using empty set", async () => {
  const js = await transpileToJS(SAMPLES.usingEmptySet);
  assertStringIncludes(js, "const s = new Set");
  assertStringIncludes(js, "const s_with_item = new Set([1])");
});

// Test passing empty structures to functions
Deno.test("passing empty structures to functions", async () => {
  const js = await transpileToJS(SAMPLES.passingEmptyStructures);
  assertStringIncludes(js, "process_data([], {})");
});

// Test nested empty structures
Deno.test("nested empty structures", async () => {
  const js = await transpileToJS(SAMPLES.nestedEmpty);
  // Fixed to match actual output format (some keys are quoted, some aren't)
  assertStringIncludes(js, "\"empty-array\":");
  assertStringIncludes(js, "\"empty-map\":");
  assertStringIncludes(js, "\"empty-set\":");
  assertStringIncludes(js, "mixed:"); // No quotes on mixed
});

// Test combining all types
Deno.test("combined empty literals", async () => {
  const js = await transpileToJS(SAMPLES.combined);
  assertStringIncludes(js, "const empty_vec = []");
  assertStringIncludes(js, "const empty_map = {}");
  assertStringIncludes(js, "new Set");
  assertStringIncludes(js, "const empty_list = []");
  assertStringIncludes(js, "const results = [empty_vec, empty_map, empty_set, empty_list]");
});