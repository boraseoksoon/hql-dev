// test/data_structures/normal_literals_test.ts

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-ast-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for normal data structure literals
const SAMPLES = {
  // Vectors with different types
  simpleVector: `(def numbers [1, 2, 3, 4, 5])`,
  mixedVector: `(def mixed ["string", 42, true, nil])`,
  nestedVector: `(def nested [[1, 2], [3, 4], [5, 6]])`,
  
  // Maps with different types
  simpleMap: `(def scores {"Alice": 95, "Bob": 87, "Charlie": 92})`,
  nestedMap: `(def config {"server": {"host": "localhost", "port": 8080}, "debug": true})`,
  
  // Sets
  simpleSet: `(def unique-nums #[1, 2, 3, 4, 5])`,
  stringSet: `(def unique-words #["apple", "banana", "cherry"])`,
  
  // Quoted lists
  simpleList: `(def items '(1 2 3 4 5))`,
  mixedList: `(def mixed-list '("string" 42 true nil))`,
  
  // Using data structures in expressions
  vectorAccess: `
    (def nums [10, 20, 30, 40, 50])
    (def second-item (get nums 1))
  `,
  
  mapAccess: `
    (def user {"name": "John", "age": 30})
    (def user-name (get user "name"))
  `,
  
  // Combining different data structures
  combined: `
    (def data {
      "vectors": [[1, 2], [3, 4]],
      "maps": [{"a": 1}, {"b": 2}],
      "sets": [#[1, 2], #[3, 4]]
    })
  `
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Tests for normal data structure literals
Deno.test("normal vectors - simple", async () => {
  const js = await transpileToJS(SAMPLES.simpleVector);
  assertStringIncludes(js, "const numbers = [1, 2, 3, 4, 5]");
});

Deno.test("normal vectors - mixed types", async () => {
  const js = await transpileToJS(SAMPLES.mixedVector);
  assertStringIncludes(js, "const mixed = [\"string\", 42, true, null]");
});

Deno.test("normal vectors - nested", async () => {
  const js = await transpileToJS(SAMPLES.nestedVector);
  assertStringIncludes(js, "const nested = [[1, 2], [3, 4], [5, 6]]");
});

Deno.test("normal maps - simple", async () => {
  const js = await transpileToJS(SAMPLES.simpleMap);
  assertStringIncludes(js, "const scores = {");
  assertStringIncludes(js, "Alice: 95");
  assertStringIncludes(js, "Bob: 87");
  assertStringIncludes(js, "Charlie: 92");
});

Deno.test("normal maps - nested", async () => {
  const js = await transpileToJS(SAMPLES.nestedMap);
  assertStringIncludes(js, "const config = {");
  assertStringIncludes(js, "server: {");
  assertStringIncludes(js, "host: \"localhost\"");
  assertStringIncludes(js, "port: 8080");
  assertStringIncludes(js, "debug: true");
});

Deno.test("normal sets - numbers", async () => {
  const js = await transpileToJS(SAMPLES.simpleSet);
  assertStringIncludes(js, "const unique_nums = new Set([1, 2, 3, 4, 5])");
});

Deno.test("normal sets - strings", async () => {
  const js = await transpileToJS(SAMPLES.stringSet);
  assertStringIncludes(js, "const unique_words = new Set([\"apple\", \"banana\", \"cherry\"])");
});

Deno.test("normal lists - simple", async () => {
  const js = await transpileToJS(SAMPLES.simpleList);
  assertStringIncludes(js, "const items = [1, 2, 3, 4, 5]");
});

Deno.test("normal lists - mixed", async () => {
  const js = await transpileToJS(SAMPLES.mixedList);
  assertStringIncludes(js, "const mixed_list = [\"string\", 42, true, null]");
});

Deno.test("using vectors - access", async () => {
  const js = await transpileToJS(SAMPLES.vectorAccess);
  assertStringIncludes(js, "const nums = [10, 20, 30, 40, 50]");
  assertStringIncludes(js, "const second_item = get(nums, 1");
});

Deno.test("using maps - access", async () => {
  const js = await transpileToJS(SAMPLES.mapAccess);
  assertStringIncludes(js, "const user = {");
  assertStringIncludes(js, "name: \"John\"");
  assertStringIncludes(js, "const user_name = get(user, \"name\"");
});

Deno.test("combining data structures", async () => {
  const js = await transpileToJS(SAMPLES.combined);
  assertStringIncludes(js, "const data = {");
  assertStringIncludes(js, "vectors: [[1, 2], [3, 4]]");
  assertStringIncludes(js, "maps: [{");
  assertStringIncludes(js, "sets: [new Set([1, 2]), new Set([3, 4])]");
});