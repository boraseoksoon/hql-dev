// Additional tests for quote (')

import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { initializeGlobalEnv, evaluateForMacro, makeList, makeSymbol, makeLiteral } from "../../src/bootstrap.ts";

// Helper to parse HQL and get first node
function parseHQL(source: string) {
  return parse(source)[0];
}

// Tests for quote operations
Deno.test("quote - nested quoted lists", async () => {
  const ast = parseHQL("'(a (b c) d)");
  const env = await initializeGlobalEnv();
  const result = await evaluateForMacro(ast, env);
  
  assertEquals(result.type, "list");
  assertEquals(result.elements.length, 3);
  assertEquals(result.elements[0].type, "symbol");
  assertEquals(result.elements[0].name, "a");
  assertEquals(result.elements[1].type, "list");
  assertEquals(result.elements[2].type, "symbol");
  assertEquals(result.elements[2].name, "d");
});

Deno.test("quote - quote prevents evaluation of expressions", async () => {
  // Define x in the environment
  const env = await initializeGlobalEnv();
  env.define("x", 42);
  
  // Quote should prevent evaluation of x
  const ast = parseHQL("'(+ x 1)");
  const result = await evaluateForMacro(ast, env);
  
  assertEquals(result.type, "list");
  assertEquals(result.elements.length, 3);
  assertEquals(result.elements[0].type, "symbol");
  assertEquals(result.elements[0].name, "+");
  assertEquals(result.elements[1].type, "symbol");
  assertEquals(result.elements[1].name, "x"); // Not evaluated to 42
  assertEquals(result.elements[2].type, "literal");
  assertEquals(result.elements[2].value, 1);
});

Deno.test("quote - accessing quoted values", async () => {
  // Create environment and manually define a quoted list
  const env = await initializeGlobalEnv();
  const quotedList = makeList(
    makeSymbol("a"),
    makeSymbol("b"),
    makeSymbol("c")
  );
  
  // Store the quoted list directly in the environment
  env.define("sym-list", quotedList);
  
  // Verify the quoted value was stored correctly
  const symList = env.lookup("sym-list");
  assertEquals(symList.type, "list");
  assertEquals(symList.elements.length, 3);
  assertEquals(symList.elements[0].type, "symbol");
  assertEquals(symList.elements[0].name, "a");
});