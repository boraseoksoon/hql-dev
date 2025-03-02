// test/data_structures_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../src/transpiler/parser.ts";
import { transformToIR } from "../src/transpiler/hql-to-ir.ts";
import { expandMacros } from "../src/macro.ts";
import { convertIRToTSAST } from "../src/transpiler/ir-to-ts-ast.ts";
import { generateTypeScript } from "../src/transpiler/ts-ast-to-code.ts";
import { transpile } from "../src/transpiler/transformer.ts";

// Test data for each test case
const TEST_CASES = {
  // Test vector literals
  vectorLiteral: {
    input: `(def my-vector [1 2 3 4 5])`,
    expectedIR: "ArrayLiteral",
    expectedJS: "const myVector = [1, 2, 3, 4, 5];"
  },
  // Test map (JSON) literals
  mapLiteral: {
    input: `(def my-map {"name": "Alice", "age": 30})`,
    expectedIR: "ObjectLiteral",
    expectedJS: "const myMap = {name: \"Alice\", age: 30};"
  },
  // Test set literals
  setLiteral: {
    input: `(def my-set #[1 2 3 4 5])`,
    expectedIR: "NewExpression",
    expectedJS: "const mySet = new Set([1, 2, 3, 4, 5]);"
  },
  // Test nested data structures
  nestedDataStructures: {
    input: `(def data {"users": [{"name": "Alice", "active": true}, {"name": "Bob", "active": false}], "settings": #[1 2 3]})`,
    expectedIR: "ObjectLiteral",
    expectedJS: "const data ="
  },
  // Test list (traditional S-expression)
  listLiteral: {
    input: `(def my-list (list 1 2 3 4 5))`,
    expectedIR: "ArrayLiteral",
    expectedJS: "const myList = createList(1, 2, 3, 4, 5);"
  },
  // Test hash-map
  hashMapLiteral: {
    input: `(def my-hash-map (hash-map "key1" "value1" "key2" "value2"))`,
    expectedIR: "ObjectLiteral",
    expectedJS: "const myHashMap = createMap([[\"key1\", \"value1\"], [\"key2\", \"value2\"]]);"
  },
  // Test hash-set
  hashSetLiteral: {
    input: `(def my-hash-set (hash-set 1 2 3 4 5))`,
    expectedIR: "NewExpression",
    expectedJS: "const myHashSet = createSet(1, 2, 3, 4, 5);"
  }
};

Deno.test("Data Structure Literals - Parser", async () => {
  // Test parsing of vector literals
  const vectorAST = parse(TEST_CASES.vectorLiteral.input);
  assertEquals(vectorAST.length, 1);
  assertEquals(vectorAST[0].type, "list");
  
  // Test parsing of set literals
  const setAST = parse(TEST_CASES.setLiteral.input);
  assertEquals(setAST.length, 1);
  assertEquals(setAST[0].type, "list");
  
  // Test parsing of map (JSON) literals 
  const mapAST = parse(TEST_CASES.mapLiteral.input);
  assertEquals(mapAST.length, 1);
  assertEquals(mapAST[0].type, "list");
  
  // Test parsing of nested data structures
  const nestedAST = parse(TEST_CASES.nestedDataStructures.input);
  assertEquals(nestedAST.length, 1);
  assertEquals(nestedAST[0].type, "list");
});

Deno.test("Data Structure Literals - Macro Expansion", async () => {
  // Test expansion of vector syntax to core S-expression
  const vectorAST = parse(TEST_CASES.vectorLiteral.input);
  const expandedVector = expandMacros(vectorAST);
  assertEquals(expandedVector.length, 1);
  assertEquals(expandedVector[0].type, "list");
  
  // Test expansion of set syntax to core S-expression
  const setAST = parse(TEST_CASES.setLiteral.input);
  const expandedSet = expandMacros(setAST);
  assertEquals(expandedSet.length, 1);
  assertEquals(expandedSet[0].type, "list");
});

Deno.test("Data Structure Literals - IR Generation", async () => {
  // Test IR generation for vector literals
  const vectorAST = parse(TEST_CASES.vectorLiteral.input);
  const expandedVector = expandMacros(vectorAST);
  const vectorIR = transformToIR(expandedVector, ".");
  assertStringIncludes(JSON.stringify(vectorIR), TEST_CASES.vectorLiteral.expectedIR);
  
  // Test IR generation for set literals
  const setAST = parse(TEST_CASES.setLiteral.input);
  const expandedSet = expandMacros(setAST);
  const setIR = transformToIR(expandedSet, ".");
  assertStringIncludes(JSON.stringify(setIR), TEST_CASES.setLiteral.expectedIR);
  
  // Test IR generation for map (JSON) literals
  const mapAST = parse(TEST_CASES.mapLiteral.input);
  const expandedMap = expandMacros(mapAST);
  const mapIR = transformToIR(expandedMap, ".");
  assertStringIncludes(JSON.stringify(mapIR), TEST_CASES.mapLiteral.expectedIR);
});

Deno.test("Data Structure Literals - Code Generation", async () => {
  // Test JS code generation for vector literals
  const vectorAST = parse(TEST_CASES.vectorLiteral.input);
  const expandedVector = expandMacros(vectorAST);
  const vectorIR = transformToIR(expandedVector, ".");
  const vectorTSAST = convertIRToTSAST(vectorIR);
  const vectorJS = generateTypeScript(vectorTSAST);
  assertStringIncludes(vectorJS, TEST_CASES.vectorLiteral.expectedJS);
  
  // Test JS code generation for set literals
  const setAST = parse(TEST_CASES.setLiteral.input);
  const expandedSet = expandMacros(setAST);
  const setIR = transformToIR(expandedSet, ".");
  const setTSAST = convertIRToTSAST(setIR);
  const setJS = generateTypeScript(setTSAST);
  assertStringIncludes(setJS, TEST_CASES.setLiteral.expectedJS);
  
  // Test JS code generation for map (JSON) literals
  const mapAST = parse(TEST_CASES.mapLiteral.input);
  const expandedMap = expandMacros(mapAST);
  const mapIR = transformToIR(expandedMap, ".");
  const mapTSAST = convertIRToTSAST(mapIR);
  const mapJS = generateTypeScript(mapTSAST);
  assertStringIncludes(mapJS, TEST_CASES.mapLiteral.expectedJS);
});

Deno.test("Data Structure Literals - Full Transpilation", async () => {
  // Test full transpilation for all data structure types
  for (const [name, testCase] of Object.entries(TEST_CASES)) {
    const result = await transpile(testCase.input);
    assertStringIncludes(result, testCase.expectedJS);
  }
});

Deno.test("Data Structure Literals - Complete File", async () => {
  // Test a complete file with multiple data structure types
  const completeFile = `
  ;; Test all data structure literals
  (def my-vector [1 2 3 4 5])
  (def my-set #[1 2 3 4 5])
  (def my-map {"name": "Alice", "age": 30, "skills": ["JavaScript", "HQL"]})
  (def my-list (list 1 2 3 4 5))
  (def my-hash-map (hash-map "key1" "value1" "key2" "value2"))
  (def my-hash-set (hash-set 1 2 3 4 5))
  
  ;; Test using data structures in functions
  (defn process-data (data)
    (let [
      vec-length (js/Array my-vector.length)
      set-size (js/Array my-set.size)
      user-name (get my-map "name")
    ]
      (hash-map
        (keyword "vectorLength") vec-length
        (keyword "setSize") set-size
        (keyword "userName") user-name
      )
    )
  )
  
  ;; Export results for testing
  (export "processData" process-data)
  `;
  
  const result = await transpile(completeFile);
  
  // Test that all data structures were transpiled correctly
  assertStringIncludes(result, "const myVector = [1, 2, 3, 4, 5];");
  assertStringIncludes(result, "const mySet = new Set([1, 2, 3, 4, 5]);");
  assertStringIncludes(result, "const myMap = {name: \"Alice\", age: 30");
  assertStringIncludes(result, "const myList = createList(1, 2, 3, 4, 5);");
  
  // Test that the function was transpiled correctly
  assertStringIncludes(result, "function processData(data)");
  
  // Test that exports were created correctly
  assertStringIncludes(result, "export { processData };");
});