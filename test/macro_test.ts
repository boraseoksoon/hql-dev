// test/macro_test.ts - Fixed test for type annotations in fx macro
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../src/transpiler/parser.ts";
import { expandMacros } from "../src/macro.ts";
import { HQLNode, ListNode, SymbolNode } from "../src/transpiler/hql_ast.ts";

// Helper function to parse input and expand macros
function parseAndExpand(input: string): HQLNode[] {
  const ast = parse(input);
  return ast.map(node => expandMacros(node));
}

Deno.test("macro - fx expansion", () => {
  // The fx form is parsed as a list with the first element 'fx'
  const ast = parse('(fx add (x y) (+ x y))');
  
  // Verify the parsed structure is a list with 'fx' as the first element
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  
  const listNode = ast[0] as ListNode;
  assertEquals(listNode.elements[0].type, "symbol");
  assertEquals((listNode.elements[0] as SymbolNode).name, "fx");
  
  // Apply macro expansion
  const expanded = expandMacros(ast[0]);
  
  // Verify it expands to defun
  assertEquals(expanded.type, "list");
  const expandedList = expanded as ListNode;
  assertEquals(expandedList.elements[0].type, "symbol");
  assertEquals((expandedList.elements[0] as SymbolNode).name, "defun");
  assertEquals((expandedList.elements[1] as SymbolNode).name, "add");
});

Deno.test("macro - fx with type annotations", () => {
  const ast = parse('(fx add (x: Int y: Int = 0) -> Int (+ x y))');
  
  // Verify the parsed structure
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  
  // Apply macro expansion
  const expanded = expandMacros(ast[0]);
  
  // Verify expansion to defun
  assertEquals(expanded.type, "list");
  const expandedList = expanded as ListNode;
  assertEquals((expandedList.elements[0] as SymbolNode).name, "defun");
  
  // Check parameter list
  const paramList = expandedList.elements[2] as ListNode;
  
  // Should have at least one parameter (x)
  assertEquals(paramList.elements.length > 0, true);
  
  // Get first parameter
  const firstParam = paramList.elements[0];
  assertEquals(firstParam.type, "symbol");
  assertEquals((firstParam as SymbolNode).name, "x");
  
  // Check for &optional marker
  let hasOptional = false;
  for (const param of paramList.elements) {
    if (param.type === "symbol" && (param as SymbolNode).name === "&optional") {
      hasOptional = true;
      break;
    }
  }
  
  // Should have &optional marker for the default parameter
  assertEquals(hasOptional, true);
  
  // Should have a parameter with default value after &optional
  const optionalIndex = paramList.elements.findIndex(
    p => p.type === "symbol" && (p as SymbolNode).name === "&optional"
  );
  
  // If &optional found, verify we have a parameter list after it
  if (optionalIndex !== -1 && optionalIndex + 1 < paramList.elements.length) {
    const optionalParam = paramList.elements[optionalIndex + 1];
    assertEquals(optionalParam.type, "list");
    
    // The optional param should be a list with at least 2 elements
    const optionalParamList = optionalParam as ListNode;
    assertEquals(optionalParamList.elements.length >= 2, true);
    
    // First element should be the parameter name
    assertEquals(optionalParamList.elements[0].type, "symbol");
    assertEquals((optionalParamList.elements[0] as SymbolNode).name, "y");
  }
});

Deno.test("macro - JSON object literal expansion", () => {
  const expanded = parseAndExpand('{"name": "Alice", "age": 30}');
  
  // Check that object literal expands to hash-map
  assertEquals(expanded.length, 1);
  assertEquals(expanded[0].type, "list");
  
  const listNode = expanded[0] as ListNode;
  assertEquals(listNode.elements[0].type, "symbol");
  assertEquals((listNode.elements[0] as SymbolNode).name, "hash-map");
  
  // Check keyword conversion
  assertEquals(listNode.elements[1].type, "list");
  const keywordCall = listNode.elements[1] as ListNode;
  assertEquals((keywordCall.elements[0] as SymbolNode).name, "keyword");
  
  // Alternating keyword calls and values
  assertEquals(listNode.elements.length, 5); // hash-map + 2 keys + 2 values
});

Deno.test("macro - JSON array literal expansion", () => {
  const expanded = parseAndExpand('[1, 2, 3]');
  
  // Check that array literal expands to vector
  assertEquals(expanded.length, 1);
  assertEquals(expanded[0].type, "list");
  
  const listNode = expanded[0] as ListNode;
  assertEquals(listNode.elements[0].type, "symbol");
  assertEquals((listNode.elements[0] as SymbolNode).name, "vector");
  
  // Check that elements are preserved
  assertEquals(listNode.elements.length, 4); // vector + 3 elements
  assertEquals(listNode.elements[1].type, "literal");
  assertEquals(listNode.elements[2].type, "literal");
  assertEquals(listNode.elements[3].type, "literal");
});

Deno.test("macro - set literal expansion", () => {
  const expanded = parseAndExpand('#[1, 2, 3]');
  
  // js-set macro should already be applied by parser, transformed to new Set(vector...)
  assertEquals(expanded.length, 1);
  assertEquals(expanded[0].type, "list");
  
  const listNode = expanded[0] as ListNode;
  assertEquals(listNode.elements[0].type, "symbol");
  assertEquals((listNode.elements[0] as SymbolNode).name, "new");
  assertEquals((listNode.elements[1] as SymbolNode).name, "Set");
  
  // Vector argument
  const vectorArg = listNode.elements[2] as ListNode;
  assertEquals(vectorArg.elements[0].type, "symbol");
  assertEquals((vectorArg.elements[0] as SymbolNode).name, "vector");
});

Deno.test("macro - nested data structure expansion", () => {
  const expanded = parseAndExpand(`
    {
      "users": [
        {"name": "Alice"},
        {"name": "Bob"}
      ]
    }
  `);
  
  // Check that the object expands to hash-map
  assertEquals(expanded.length, 1);
  assertEquals(expanded[0].type, "list");
  
  const hashMap = expanded[0] as ListNode;
  assertEquals((hashMap.elements[0] as SymbolNode).name, "hash-map");
  
  // "users" key and vector value
  const usersKeyword = hashMap.elements[1] as ListNode;
  assertEquals((usersKeyword.elements[0] as SymbolNode).name, "keyword");
});

Deno.test("macro - recursive expansion in nested structures", () => {
  // First, properly parse the structure as a list with fx as the first element
  const ast = parse(`
    (fx process-user (user-id: Number)
      (let [
        user (get-user user-id)
      ]
        {"name": (get user "name"), "processed": true}
      ))
  `);
  
  // Verify we parse it correctly
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  
  // Apply macro expansion
  const expanded = expandMacros(ast[0]);
  
  // Verify fx expansion to defun
  assertEquals(expanded.type, "list");
  assertEquals((expanded as ListNode).elements[0].type, "symbol");
  assertEquals(((expanded as ListNode).elements[0] as SymbolNode).name, "defun");
});