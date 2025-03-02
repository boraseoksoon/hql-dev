// test/data_structures_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../src/transpiler/parser.ts";
import { read } from "../src/transpiler/reader.ts";
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
    expectedJS: "const myVector = createVector(1, 2, 3, 4, 5);"
  },
  // Test map (JSON) literals
  mapLiteral: {
    input: `(def my-map {"name": "Alice", "age": 30})`,
    expectedJS: "const myMap = createMap([[\"name\", \"Alice\"], [\"age\", 30]]);"
  },
  // Test set literals
  setLiteral: {
    input: `(def my-set #[1 2 3 4 5])`,
    expectedJS: "const mySet = createSet(1, 2, 3, 4, 5);"
  },
  // Test nested data structures
  nestedDataStructures: {
    input: `(def data {"users": [{"name": "Alice", "active": true}, {"name": "Bob", "active": false}], "settings": #[1 2 3]})`,
    expectedJS: "const data ="
  },
  // Test list (traditional S-expression)
  listLiteral: {
    input: `(def my-list (list 1 2 3 4 5))`,
    expectedJS: "const myList = createList(1, 2, 3, 4, 5);"
  }
};

Deno.test("Data Structure Literals - Parser Directly Creates S-expressions", async () => {
  // Test parsing of vector literals
  const vectorAST = parse(TEST_CASES.vectorLiteral.input);
  assertEquals(vectorAST.length, 1);
  assertEquals(vectorAST[0].type, "list");
  const vectorDefList = vectorAST[0] as any;
  
  // The vector literal should be a literal node with an array value
  const vectorLiteral = vectorDefList.elements[2];
  assertEquals(vectorLiteral.type, "literal");
  assertEquals(Array.isArray(vectorLiteral.value), true);
  
  // Test parsing of set literals
  const setAST = parse(TEST_CASES.setLiteral.input);
  assertEquals(setAST.length, 1);
  assertEquals(setAST[0].type, "list");
  const setDefList = setAST[0] as any;
  
  // The set literal should be a literal node with a Set value
  const setLiteral = setDefList.elements[2];
  assertEquals(setLiteral.type, "literal");
  assertEquals(setLiteral.value instanceof Set, true);
  
  // Test parsing of map (JSON) literals
  const mapAST = parse(TEST_CASES.mapLiteral.input);
  assertEquals(mapAST.length, 1);
  assertEquals(mapAST[0].type, "list");
  const mapDefList = mapAST[0] as any;
  
  // The map literal should be a literal node with an object value
  const mapLiteral = mapDefList.elements[2];
  assertEquals(mapLiteral.type, "literal");
  assertEquals(typeof mapLiteral.value, "object");
  assertEquals(mapLiteral.value !== null, true);
});

Deno.test("Data Structure Literals - Macro Expansion No Longer Needed", async () => {
  // Test that the reader transforms JavaScript literals to S-expressions
  const vectorAST = parse(TEST_CASES.vectorLiteral.input);
  
  // First, let's see what read does directly
  const readVectorAST = read(vectorAST);
  
  // The vector literal should now be a list with 'vector' as the first element
  const readVectorDefList = readVectorAST[0] as any;
  const readVectorExpr = readVectorDefList.elements[2];
  assertEquals(readVectorExpr.type, "list");
  assertEquals(readVectorExpr.elements[0].type, "symbol");
  assertEquals(readVectorExpr.elements[0].name, "vector");
  
  // Now let's see if expandMacros correctly uses read
  const expandedVectorAST = expandMacros(vectorAST);
  
  // The expanded AST should have the same structure as the read AST
  assertEquals(JSON.stringify(expandedVectorAST), JSON.stringify(readVectorAST));
});

Deno.test("Data Structure Literals - IR Generation", async () => {
  // Test IR generation with transformed nodes
  const vectorAST = parse(TEST_CASES.vectorLiteral.input);
  const expandedVectorAST = expandMacros(vectorAST);
  const vectorIR = transformToIR(expandedVectorAST, ".");
  
  // Make sure the IR contains a call to createVector
  const irString = JSON.stringify(vectorIR);
  assertStringIncludes(irString, "createVector");
  
  // Test set and map as well
  const setAST = parse(TEST_CASES.setLiteral.input);
  const expandedSetAST = expandMacros(setAST);
  const setIR = transformToIR(expandedSetAST, ".");
  assertStringIncludes(JSON.stringify(setIR), "createSet");
  
  const mapAST = parse(TEST_CASES.mapLiteral.input);
  const expandedMapAST = expandMacros(mapAST);
  const mapIR = transformToIR(expandedMapAST, ".");
  assertStringIncludes(JSON.stringify(mapIR), "createMap");
});

Deno.test("Data Structure Literals - Code Generation", async () => {
  // Test JS code generation for vector literals
  const vectorAST = parse(TEST_CASES.vectorLiteral.input);
  const expandedVectorAST = expandMacros(vectorAST);
  const vectorIR = transformToIR(expandedVectorAST, ".");
  const vectorTSAST = convertIRToTSAST(vectorIR);
  const vectorJS = generateTypeScript(vectorTSAST, { formatting: "minimal" });
  assertStringIncludes(vectorJS, TEST_CASES.vectorLiteral.expectedJS);
  
  // Test JS code generation for set literals
  const setAST = parse(TEST_CASES.setLiteral.input);
  const expandedSetAST = expandMacros(setAST);
  const setIR = transformToIR(expandedSetAST, ".");
  const setTSAST = convertIRToTSAST(setIR);
  const setJS = generateTypeScript(setTSAST, { formatting: "minimal" });
  assertStringIncludes(setJS, TEST_CASES.setLiteral.expectedJS);
  
  // Test JS code generation for map (JSON) literals
  const mapAST = parse(TEST_CASES.mapLiteral.input);
  const expandedMapAST = expandMacros(mapAST);
  const mapIR = transformToIR(expandedMapAST, ".");
  const mapTSAST = convertIRToTSAST(mapIR);
  const mapJS = generateTypeScript(mapTSAST, { formatting: "minimal" });
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
  
  ;; Test using data structures in functions
  (defn process-data (data)
    (let [
      vec-length (js/Array.from my-vector.length)
      set-size (js/Array.from my-set.size)
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
  assertStringIncludes(result, "const myVector = createVector(1, 2, 3, 4, 5);");
  assertStringIncludes(result, "const mySet = createSet(1, 2, 3, 4, 5);");
  assertStringIncludes(result, "const myMap = createMap([");
  assertStringIncludes(result, "const myList = createList(1, 2, 3, 4, 5);");
  
  // Test that the function was transpiled correctly
  assertStringIncludes(result, "function processData(data)");
  
  // Test that exports were created correctly
  assertStringIncludes(result, "export { processData };");
});