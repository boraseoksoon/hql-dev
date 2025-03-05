// test/parser_test.ts - Rewritten to align with macro-driven approach
import { assertEquals, assertThrows } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../src/transpiler/parser.ts";
import { 
  HQLNode, 
  ListNode, 
  LiteralNode, 
  SymbolNode 
} from "../src/transpiler/hql_ast.ts";
import { ParseError } from "../src/transpiler/errors.ts";
import { expandMacros } from "../src/macro.ts";

// Helper function to assert equality while ignoring position info for simplicity
function assertAstEqual(actual: HQLNode[], expected: HQLNode[]) {
  assertEquals(JSON.stringify(actual), JSON.stringify(expected));
}

// Basic parser tests
Deno.test("parser - empty input", () => {
  const ast = parse("");
  assertEquals(ast.length, 0);
});

Deno.test("parser - literal values", () => {
  // String
  let ast = parse('"hello"');
  assertAstEqual(ast, [{ type: "literal", value: "hello" }]);
  
  // Numbers
  ast = parse("123");
  assertAstEqual(ast, [{ type: "literal", value: 123 }]);
  
  // Booleans
  ast = parse("true");
  assertAstEqual(ast, [{ type: "literal", value: true }]);
  
  // Null
  ast = parse("null");
  assertAstEqual(ast, [{ type: "literal", value: null }]);
});

Deno.test("parser - symbols", () => {
  const ast = parse("foo bar baz");
  assertAstEqual(ast, [
    { type: "symbol", name: "foo" },
    { type: "symbol", name: "bar" },
    { type: "symbol", name: "baz" }
  ]);
});

// Tests for reader macros and syntactic forms

Deno.test("parser - JSON object literal", () => {
  const ast = parse('{"name": "Alice", "age": 30}');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  
  const hashMapNode = ast[0] as ListNode;
  assertEquals(hashMapNode.elements[0].type, "symbol");
  assertEquals((hashMapNode.elements[0] as SymbolNode).name, "hash-map");
  
  // Check for key-value pairs
  assertEquals(hashMapNode.elements.length, 5); // hash-map + 2 keys + 2 values
  
  // Check first key-value pair (name)
  const nameKey = hashMapNode.elements[1] as ListNode;
  assertEquals(nameKey.type, "list");
  assertEquals(nameKey.elements[0].type, "symbol");
  assertEquals((nameKey.elements[0] as SymbolNode).name, "keyword");
  assertEquals(nameKey.elements[1].type, "literal");
  assertEquals((nameKey.elements[1] as LiteralNode).value, "name");
  
  // Check first value
  const nameValue = hashMapNode.elements[2];
  assertEquals(nameValue.type, "literal");
  assertEquals((nameValue as LiteralNode).value, "Alice");
  
  // Check second key-value pair (age)
  const ageKey = hashMapNode.elements[3] as ListNode;
  assertEquals(ageKey.type, "list");
  assertEquals(ageKey.elements[0].type, "symbol");
  assertEquals((ageKey.elements[0] as SymbolNode).name, "keyword");
  assertEquals(ageKey.elements[1].type, "literal");
  assertEquals((ageKey.elements[1] as LiteralNode).value, "age");
  
  // Check second value
  const ageValue = hashMapNode.elements[4];
  assertEquals(ageValue.type, "literal");
  assertEquals((ageValue as LiteralNode).value, 30);
});


Deno.test("parser - nested JSON object literal", () => {
  const ast = parse('{"user": {"name": "Bob", "age": 25}}');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  
  const hashMapNode = ast[0] as ListNode;
  assertEquals(hashMapNode.elements[0].type, "symbol");
  assertEquals((hashMapNode.elements[0] as SymbolNode).name, "hash-map");
  
  // Check for user key
  const userKey = hashMapNode.elements[1] as ListNode;
  assertEquals(userKey.type, "list");
  assertEquals(userKey.elements[0].type, "symbol");
  assertEquals((userKey.elements[0] as SymbolNode).name, "keyword");
  assertEquals(userKey.elements[1].type, "literal");
  assertEquals((userKey.elements[1] as LiteralNode).value, "user");
  
  // Check for user value (another hash-map)
  const userValue = hashMapNode.elements[2] as ListNode;
  assertEquals(userValue.type, "list");
  assertEquals(userValue.elements[0].type, "symbol");
  assertEquals((userValue.elements[0] as SymbolNode).name, "hash-map");
});

Deno.test("parser - JSON array literal", () => {
  const ast = parse('[1, 2, 3, "four"]');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  
  const vectorNode = ast[0] as ListNode;
  assertEquals(vectorNode.elements[0].type, "symbol");
  assertEquals((vectorNode.elements[0] as SymbolNode).name, "vector");
  
  // Check array elements
  assertEquals(vectorNode.elements.length, 5); // vector + 4 elements
  assertEquals(vectorNode.elements[1].type, "literal");
  assertEquals((vectorNode.elements[1] as LiteralNode).value, 1);
  assertEquals(vectorNode.elements[4].type, "literal");
  assertEquals((vectorNode.elements[4] as LiteralNode).value, "four");
});

Deno.test("parser - set literal", () => {
  const ast = parse('#[1, 2, 3]');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  
  const setNode = ast[0] as ListNode;
  assertEquals(setNode.elements[0].type, "symbol");
  assertEquals((setNode.elements[0] as SymbolNode).name, "set");
  
  // Check elements
  assertEquals(setNode.elements.length, 4); // set + 3 elements
  assertEquals(setNode.elements[1].type, "literal");
  assertEquals((setNode.elements[1] as LiteralNode).value, 1);
  assertEquals(setNode.elements[3].type, "literal");
  assertEquals((setNode.elements[3] as LiteralNode).value, 3);
});

Deno.test("parser - fx form", () => {
  const ast = parse('(fx add (x y) (+ x y))');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  
  const fxNode = ast[0] as ListNode;
  assertEquals(fxNode.elements[0].type, "symbol");
  assertEquals((fxNode.elements[0] as SymbolNode).name, "fx");
  
  // Check function name
  assertEquals(fxNode.elements[1].type, "symbol");
  assertEquals((fxNode.elements[1] as SymbolNode).name, "add");
  
  // Check parameter list
  assertEquals(fxNode.elements[2].type, "list");
  const params = fxNode.elements[2] as ListNode;
  assertEquals(params.elements[0].type, "symbol");
  assertEquals((params.elements[0] as SymbolNode).name, "x");
  assertEquals(params.elements[1].type, "symbol");
  assertEquals((params.elements[1] as SymbolNode).name, "y");
  
  // Check function body
  assertEquals(fxNode.elements[3].type, "list");
  const body = fxNode.elements[3] as ListNode;
  assertEquals(body.elements[0].type, "symbol");
  assertEquals((body.elements[0] as SymbolNode).name, "+");
});

Deno.test("parser - fx form with named parameters", () => {
  const ast = parse('(fx greet-user (name: String title: String) (str "Hello, " title " " name "!"))');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  
  const fxNode = ast[0] as ListNode;
  assertEquals(fxNode.elements[0].type, "symbol");
  assertEquals((fxNode.elements[0] as SymbolNode).name, "fx");
  
  // Check parameter list
  const paramList = fxNode.elements[2] as ListNode;
  
  // In our macro-based system, named parameters are represented as lists
  // Check first parameter - should be a list with param and name
  const firstParam = paramList.elements[0];
  assertEquals(firstParam.type, "list");
  
  const firstParamList = firstParam as ListNode;
  assertEquals(firstParamList.elements[0].type, "symbol");
  assertEquals((firstParamList.elements[0] as SymbolNode).name, "param");
  assertEquals(firstParamList.elements[1].type, "literal");
  assertEquals((firstParamList.elements[1] as LiteralNode).value, "name");
  
  // Check second parameter
  const secondParam = paramList.elements[1];
  assertEquals(secondParam.type, "symbol");
  assertEquals((secondParam as SymbolNode).name, "String");
  
  // Check third parameter - should be a list with param and title
  const thirdParam = paramList.elements[2];
  assertEquals(thirdParam.type, "list");
  
  const thirdParamList = thirdParam as ListNode;
  assertEquals(thirdParamList.elements[0].type, "symbol");
  assertEquals((thirdParamList.elements[0] as SymbolNode).name, "param");
  assertEquals(thirdParamList.elements[1].type, "literal");
  assertEquals((thirdParamList.elements[1] as LiteralNode).value, "title");
});

Deno.test("parser - complex nested data structures", () => {
  const ast = parse(`
    {
      "users": [
        {"name": "Alice", "roles": ["admin", "user"]},
        {"name": "Bob", "roles": ["user"]}
      ],
      "settings": {
        "version": "1.0.0",
        "enabled": true
      }
    }
  `);
  
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  
  const hashMapNode = ast[0] as ListNode;
  assertEquals(hashMapNode.elements[0].type, "symbol");
  assertEquals((hashMapNode.elements[0] as SymbolNode).name, "hash-map");
  
  // Check for users key
  const usersKeyIdx = 1; // First element after hash-map
  const usersKey = hashMapNode.elements[usersKeyIdx] as ListNode;
  assertEquals(usersKey.type, "list");
  assertEquals(usersKey.elements[0].type, "symbol");
  assertEquals((usersKey.elements[0] as SymbolNode).name, "keyword");
  assertEquals(usersKey.elements[1].type, "literal");
  assertEquals((usersKey.elements[1] as LiteralNode).value, "users");
  
  // Check users value (a vector)
  const usersValueIdx = 2; // After the key comes the value
  const usersValue = hashMapNode.elements[usersValueIdx] as ListNode;
  assertEquals(usersValue.type, "list");
  assertEquals(usersValue.elements[0].type, "symbol");
  assertEquals((usersValue.elements[0] as SymbolNode).name, "vector");
  
  // We won't check every nested detail, just make sure the structure is correct
  assertEquals(usersValue.elements.length > 1, true);
});

// ERROR TESTS

Deno.test("parser - error: unclosed JSON object", () => {
  assertThrows(
    () => parse('{"name": "Alice"'),
    ParseError,
    "Unexpected end of input"
  );
});

Deno.test("parser - error: unclosed JSON array", () => {
  assertThrows(
    () => parse('[1, 2, 3'),
    ParseError,
    "Unexpected end of input"
  );
});

Deno.test("parser - error: unclosed set literal", () => {
  assertThrows(
    () => parse('#[1, 2, 3'),
    ParseError,
    "Unexpected end of input"
  );
});

Deno.test("parser - error: invalid fx form", () => {
  // In our pure macro-driven approach, (fx) is valid syntax at the parser level,
  // but will fail during macro expansion due to insufficient arguments
  const ast = parse('(fx)');
  
  // Parsing should succeed and produce a list with just the 'fx' symbol
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  
  const fxNode = ast[0] as ListNode;
  assertEquals(fxNode.elements.length, 1);
  assertEquals(fxNode.elements[0].type, "symbol");
  assertEquals((fxNode.elements[0] as SymbolNode).name, "fx");
});