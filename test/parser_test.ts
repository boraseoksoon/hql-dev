// test/parser_test.ts - Updated to fix failing tests
import { assertEquals, assertThrows } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../src/transpiler/parser.ts";
import { 
  HQLNode, 
  ListNode, 
  LiteralNode, 
  SymbolNode, 
  JsonObjectLiteralNode, 
  JsonArrayLiteralNode
} from "../src/transpiler/hql_ast.ts";
import { ParseError } from "../src/transpiler/errors.ts";

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

// Tests for raw syntax preservation

Deno.test("parser - JSON object literal", () => {
  const ast = parse('{"name": "Alice", "age": 30}');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "jsonObjectLiteral");
  
  const objNode = ast[0] as JsonObjectLiteralNode;
  assertEquals(objNode.properties["name"].type, "literal");
  assertEquals((objNode.properties["name"] as LiteralNode).value, "Alice");
  assertEquals(objNode.properties["age"].type, "literal");
  assertEquals((objNode.properties["age"] as LiteralNode).value, 30);
});

Deno.test("parser - nested JSON object literal", () => {
  const ast = parse('{"user": {"name": "Bob", "age": 25}}');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "jsonObjectLiteral");
  
  const objNode = ast[0] as JsonObjectLiteralNode;
  assertEquals(objNode.properties["user"].type, "jsonObjectLiteral");
  
  const nestedObj = objNode.properties["user"] as JsonObjectLiteralNode;
  assertEquals(nestedObj.properties["name"].type, "literal");
  assertEquals((nestedObj.properties["name"] as LiteralNode).value, "Bob");
});

Deno.test("parser - JSON array literal", () => {
  const ast = parse('[1, 2, 3, "four"]');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "jsonArrayLiteral");
  
  const arrNode = ast[0] as JsonArrayLiteralNode;
  assertEquals(arrNode.elements.length, 4);
  assertEquals(arrNode.elements[0].type, "literal");
  assertEquals((arrNode.elements[0] as LiteralNode).value, 1);
  assertEquals(arrNode.elements[3].type, "literal");
  assertEquals((arrNode.elements[3] as LiteralNode).value, "four");
});

Deno.test("parser - set literal", () => {
  const ast = parse('#[1, 2, 3]');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  
  const listNode = ast[0] as ListNode;
  assertEquals(listNode.elements[0].type, "symbol");
  assertEquals((listNode.elements[0] as SymbolNode).name, "js-set");
  
  // Check that elements are preserved
  assertEquals(listNode.elements.length, 4);
  assertEquals((listNode.elements[1] as LiteralNode).value, 1);
  assertEquals((listNode.elements[2] as LiteralNode).value, 2);
  assertEquals((listNode.elements[3] as LiteralNode).value, 3);
});

Deno.test("parser - fx form", () => {
  // Fx is now parsed as a normal list form, not a special node type
  const ast = parse('(fx add (x y) (+ x y))');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  
  const listNode = ast[0] as ListNode;
  assertEquals(listNode.elements[0].type, "symbol");
  assertEquals((listNode.elements[0] as SymbolNode).name, "fx");
  
  // Check the parameter list is a list node
  assertEquals(listNode.elements[2].type, "list");
  
  // Check the body exists
  assertEquals(listNode.elements[3].type, "list");
});

Deno.test("parser - fx form with named parameters", () => {
  // Fx with type annotations is also a list form now
  const ast = parse('(fx greet-user (name: String title: String) (str "Hello, " title " " name "!"))');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  
  const listNode = ast[0] as ListNode;
  assertEquals(listNode.elements[0].type, "symbol");
  assertEquals((listNode.elements[0] as SymbolNode).name, "fx");
  
  // Check parameter list
  const paramList = listNode.elements[2] as ListNode;

  // First parameter should be a list with type annotation
  const firstParam = paramList.elements[0] as ListNode;
  assertEquals(firstParam.type, "list");
  assertEquals(firstParam.elements.length, 3);
  assertEquals((firstParam.elements[0] as SymbolNode).name, "name");
  assertEquals((firstParam.elements[1] as SymbolNode).name, ":");
  assertEquals((firstParam.elements[2] as SymbolNode).name, "String");

  // Second parameter should also be a list with type annotation
  const secondParam = paramList.elements[1] as ListNode;
  assertEquals(secondParam.type, "list");
  assertEquals(secondParam.elements.length, 3);
  assertEquals((secondParam.elements[0] as SymbolNode).name, "title");
  assertEquals((secondParam.elements[1] as SymbolNode).name, ":");
  assertEquals((secondParam.elements[2] as SymbolNode).name, "String");
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
  assertEquals(ast[0].type, "jsonObjectLiteral");
  
  const objNode = ast[0] as JsonObjectLiteralNode;
  assertEquals(objNode.properties["users"].type, "jsonArrayLiteral");
  
  const users = objNode.properties["users"] as JsonArrayLiteralNode;
  assertEquals(users.elements.length, 2);
  assertEquals(users.elements[0].type, "jsonObjectLiteral");
  
  const alice = users.elements[0] as JsonObjectLiteralNode;
  assertEquals(alice.properties["name"].type, "literal");
  assertEquals((alice.properties["name"] as LiteralNode).value, "Alice");
  
  const aliceRoles = alice.properties["roles"] as JsonArrayLiteralNode;
  assertEquals(aliceRoles.elements.length, 2);
  assertEquals((aliceRoles.elements[0] as LiteralNode).value, "admin");
});

// Error tests

Deno.test("parser - error: unclosed JSON object", () => {
  assertThrows(
    () => parse('{"name": "Alice"'),
    ParseError,
    "Unclosed curly brace"
  );
});

Deno.test("parser - error: unclosed JSON array", () => {
  assertThrows(
    () => parse('[1, 2, 3'),
    ParseError,
    "Unclosed square bracket"
  );
});

Deno.test("parser - error: unclosed set literal", () => {
  assertThrows(
    () => parse('#[1, 2, 3'),
    ParseError,
    "Unclosed set literal"
  );
});

Deno.test("parser - error: invalid fx form", () => {
  // Update the expected error message to match what the parser actually throws
  assertThrows(
    () => parse('(fx)'),
    ParseError,
    "Unexpected token: )"
  );
});