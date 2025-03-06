// test/fx_test.ts - Official specification test suite

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../src/transpiler/parser.ts";
import { expandMacros } from "../src/macro.ts";
import { transpile } from "../src/transpiler/transformer.ts";
import { ListNode, SymbolNode } from "../src/transpiler/hql_ast.ts";
import { loadAndInitializeMacros } from "../lib/loader.ts";

// Initialize macros before tests
const initPromise = loadAndInitializeMacros().catch(err => {
  console.error("Failed to initialize macros:", err);
});

// ---------- Parsing Tests ----------
Deno.test("fx - parsing case 1: explicit types without return", async () => {
  await initPromise;
  const ast = parse('(fx add1 (x: Int y: Int) (-> Void) (+ x y))');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  const fxNode = ast[0] as ListNode;
  assertEquals(fxNode.elements[0].type, "symbol");
  assertEquals((fxNode.elements[0] as SymbolNode).name, "fx");
  
  // Check parameter types
  const paramList = fxNode.elements[2] as ListNode;
  assertEquals(paramList.elements.length, 4);  // x: Int y: Int
  assertEquals((paramList.elements[0] as SymbolNode).name, "x:");
  assertEquals((paramList.elements[1] as SymbolNode).name, "Int");
  assertEquals((paramList.elements[2] as SymbolNode).name, "y:");
  assertEquals((paramList.elements[3] as SymbolNode).name, "Int");
  
  // Check return type
  assertEquals(fxNode.elements[3].type, "symbol");
  assertEquals((fxNode.elements[3] as SymbolNode).name, "->");
  assertEquals(fxNode.elements[4].type, "symbol");
  assertEquals((fxNode.elements[4] as SymbolNode).name, "Void");
});

Deno.test("fx - parsing case 2: default values without return", async () => {
  await initPromise;
  const ast = parse('(fx add2 (x: Int y: Int = 0) (-> Void) (+ x y))');
  assertEquals(ast.length, 1);
  const fxNode = ast[0] as ListNode;
  
  // Check parameter with default value
  const paramList = fxNode.elements[2] as ListNode;
  assertEquals(paramList.elements.length, 6);  // x: Int y: Int = 0
  assertEquals((paramList.elements[0] as SymbolNode).name, "x:");
  assertEquals((paramList.elements[1] as SymbolNode).name, "Int");
  assertEquals((paramList.elements[2] as SymbolNode).name, "y:");
  assertEquals((paramList.elements[3] as SymbolNode).name, "Int");
  assertEquals((paramList.elements[4] as SymbolNode).name, "=");
  assertEquals((paramList.elements[5] as any).value, 0);
});

Deno.test("fx - parsing case 3: multiple defaults without return", async () => {
  await initPromise;
  const ast = parse('(fx add3 (x: Int = 10 y: Int = 0) (+ x y))');
  assertEquals(ast.length, 1);
  const fxNode = ast[0] as ListNode;
  
  // Check multiple parameters with default values
  const paramList = fxNode.elements[2] as ListNode;
  assertEquals(paramList.elements.length, 8);  // x: Int = 10 y: Int = 0
  assertEquals((paramList.elements[0] as SymbolNode).name, "x:");
  assertEquals((paramList.elements[1] as SymbolNode).name, "Int");
  assertEquals((paramList.elements[2] as SymbolNode).name, "=");
  assertEquals((paramList.elements[3] as any).value, 10);
  assertEquals((paramList.elements[4] as SymbolNode).name, "y:");
  assertEquals((paramList.elements[5] as SymbolNode).name, "Int");
  assertEquals((paramList.elements[6] as SymbolNode).name, "=");
  assertEquals((paramList.elements[7] as any).value, 0);
});

Deno.test("fx - parsing case 4: explicit return with type", async () => {
  await initPromise;
  const ast = parse('(fx add4 (x: Int y: Int) (-> Int) (return (+ x y)))');
  assertEquals(ast.length, 1);
  const fxNode = ast[0] as ListNode;
  
  // Check body with explicit return
  const body = fxNode.elements[5] as ListNode;
  assertEquals(body.elements[0].type, "symbol");
  assertEquals((body.elements[0] as SymbolNode).name, "return");
  
  // Check return type
  assertEquals(fxNode.elements[3].type, "symbol");
  assertEquals((fxNode.elements[3] as SymbolNode).name, "->");
  assertEquals(fxNode.elements[4].type, "symbol");
  assertEquals((fxNode.elements[4] as SymbolNode).name, "Int");
});

Deno.test("fx - parsing case 5: defaults and explicit return", async () => {
  await initPromise;
  const ast = parse('(fx add5 (x: Int y: Int = 0) (-> Int) (return (+ x y)))');
  assertEquals(ast.length, 1);
  const fxNode = ast[0] as ListNode;
  
  // Check return type
  assertEquals(fxNode.elements[3].type, "symbol");
  assertEquals((fxNode.elements[3] as SymbolNode).name, "->");
  
  // Check body with explicit return
  const body = fxNode.elements[5] as ListNode;
  assertEquals(body.elements[0].type, "symbol");
  assertEquals((body.elements[0] as SymbolNode).name, "return");
});

// ---------- Macro Expansion Tests ----------
Deno.test("fx - macro expansion to defn", async () => {
  await initPromise;
  const ast = parse('(fx add1 (x: Int y: Int) (-> Void) (+ x y))');
  const expanded = expandMacros(ast[0]);
  assertEquals(expanded.type, "list");
  const listNode = expanded as ListNode;
  
  // Only accept defn
  const firstElement = (listNode.elements[0] as SymbolNode).name;
  assertEquals(firstElement, "defn", "fx should expand to defn");
  assertEquals((listNode.elements[1] as SymbolNode).name, "add1");
  
  // Body should have a do wrapper
  const body = listNode.elements[3] as ListNode;
  assertEquals((body.elements[0] as SymbolNode).name, "do");
});

// ---------- Transpilation Tests ----------
Deno.test("fx - transpile case 1: void function with types", async () => {
  await initPromise;
  const source = '(fx add1 (x: Int y: Int) (-> Void) (+ x y))';
  
  try {
    const result = await transpile(source);
    
    // Check for function definition
    assertStringIncludes(result, "function add1");
    
    // Check for parameter handling
    assertStringIncludes(result, "x");
    assertStringIncludes(result, "y");
    
    // Check for addition operation
    assertStringIncludes(result, "+");
    
    // Should NOT have a return statement
    assertEquals(result.includes("return"), false, "Should not include return statement");
  } catch (error) {
    console.log("Case 1 test error:", error);
    throw error;
  }
});

Deno.test("fx - transpile case 4: function with explicit return", async () => {
  await initPromise;
  const source = '(fx add4 (x: Int y: Int) (-> Int) (return (+ x y)))';
  
  try {
    const result = await transpile(source);
    
    // Check for function definition
    assertStringIncludes(result, "function add4");
    
    // Check for parameter handling
    assertStringIncludes(result, "x");
    assertStringIncludes(result, "y");
    
    // Check for addition operation
    assertStringIncludes(result, "+");
    
    // MUST have a return statement
    assertStringIncludes(result, "return");
  } catch (error) {
    console.log("Case 4 test error:", error);
    throw error;
  }
});

Deno.test("fx - transpile case 5: function with defaults and return", async () => {
  await initPromise;
  const source = '(fx add5 (x: Int y: Int = 0) (-> Int) (return (+ x y)))';
  
  try {
    const result = await transpile(source);
    
    // Check for function definition
    assertStringIncludes(result, "function add5");
    
    // Check for parameter handling
    assertStringIncludes(result, "x");
    assertStringIncludes(result, "y");
    
    // MUST have a return statement
    assertStringIncludes(result, "return");
    
    // Should handle default value somehow
    // Note: The exact implementation of defaults may vary
  } catch (error) {
    console.log("Case 5 test error:", error);
    throw error;
  }
});

// Test standard defn behavior
Deno.test("defn - standard behavior without return", async () => {
  await initPromise;
  const source = '(defn defn-add (x y) (+ x y))';
  
  try {
    const result = await transpile(source);
    
    // Check for function definition
    assertStringIncludes(result, "function defnAdd");
    
    // Check for parameter handling
    assertStringIncludes(result, "x");
    assertStringIncludes(result, "y");
    
    // Check for addition operation
    assertStringIncludes(result, "+");
    
    // Should NOT have a return statement
    assertEquals(result.includes("return"), false, "Should not include return statement");
  } catch (error) {
    console.log("defn without return test error:", error);
    throw error;
  }
});

Deno.test("defn - explicit return behavior", async () => {
  await initPromise;
  const source = '(defn defn-add-2 (x y) (return (+ x y)))';
  
  try {
    const result = await transpile(source);
    
    // Check for function definition
    assertStringIncludes(result, "function defnAdd2");
    
    // Check for parameter handling
    assertStringIncludes(result, "x");
    assertStringIncludes(result, "y");
    
    // Check for addition operation
    assertStringIncludes(result, "+");
    
    // MUST have a return statement
    assertStringIncludes(result, "return");
  } catch (error) {
    console.log("defn with return test error:", error);
    throw error;
  }
});