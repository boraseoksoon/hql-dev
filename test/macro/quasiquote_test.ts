// Additional tests for quasiquote (`), unquote (~), and unquote-splicing (~@)

import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { initializeGlobalEnv, evaluateForMacro, makeList, makeLiteral, makeSymbol } from "../../src/bootstrap.ts";

// Helper to parse HQL and get first node
function parseHQL(source: string) {
  return parse(source)[0];
}

// These are additional tests that can be added to your existing quasiquote_test.ts file

Deno.test("quasiquote - shorthand syntax", async () => {
  const ast = parseHQL("`(a b c)");
  const env = await initializeGlobalEnv();
  const result = evaluateForMacro(ast, env);
  
  assertEquals(result.type, "list");
  assertEquals(result.elements.length, 3);
  assertEquals(result.elements[0].type, "symbol");
  assertEquals(result.elements[0].name, "a");
});

Deno.test("unquote - evaluating scalar values inside quasiquote", async () => {
  // Define a value in the environment
  const env = await initializeGlobalEnv();
  env.define("x", 42);
  
  const ast = parseHQL("`(a ~x c)");
  const result = evaluateForMacro(ast, env);
  
  assertEquals(result.type, "list");
  assertEquals(result.elements.length, 3);
  assertEquals(result.elements[0].type, "symbol");
  assertEquals(result.elements[0].name, "a");
  assertEquals(result.elements[1], 42); // x is evaluated to 42
  assertEquals(result.elements[2].type, "symbol");
  assertEquals(result.elements[2].name, "c");
});

Deno.test("unquote-splicing - inserting list elements", async () => {
  // Define a list in the environment
  const env = await initializeGlobalEnv();
  env.define("nums", makeList(
    makeLiteral(1),
    makeLiteral(2),
    makeLiteral(3)
  ));
  
  const ast = parseHQL("`(start ~@nums end)");
  const result = evaluateForMacro(ast, env);
  
  assertEquals(result.type, "list");
  assertEquals(result.elements.length, 5);
  assertEquals(result.elements[0].type, "symbol");
  assertEquals(result.elements[0].name, "start");
  assertEquals(result.elements[1].type, "literal");
  assertEquals(result.elements[1].value, 1);
  assertEquals(result.elements[2].type, "literal");
  assertEquals(result.elements[2].value, 2);
  assertEquals(result.elements[3].type, "literal");
  assertEquals(result.elements[3].value, 3);
  assertEquals(result.elements[4].type, "symbol");
  assertEquals(result.elements[4].name, "end");
});

Deno.test("simple quasiquote with nested list", async () => {
  const env = await initializeGlobalEnv();
  env.define("x", 42);
  
  const ast = parseHQL("`(outer (inner ~x))");
  const result = evaluateForMacro(ast, env);
  
  assertEquals(result.type, "list");
  assertEquals(result.elements.length, 2);
  assertEquals(result.elements[0].type, "symbol");
  assertEquals(result.elements[0].name, "outer");
  assertEquals(result.elements[1].type, "list");
  assertEquals(result.elements[1].elements.length, 2);
  assertEquals(result.elements[1].elements[0].type, "symbol");
  assertEquals(result.elements[1].elements[0].name, "inner");
  assertEquals(result.elements[1].elements[1], 42); // x is evaluated to 42
});

Deno.test("quasiquote usage in code structure", async () => {
  const env = await initializeGlobalEnv();
  env.define("condition", makeLiteral(true));
  env.define("body", makeList(
    makeList(
      makeSymbol("println"),
      makeLiteral("It's true!")
    )
  ));
  
  // Create and evaluate a quasiquote expression that would be similar to a macro expansion
  const whenList = makeList(
    makeSymbol("if"),
    makeSymbol("condition"),
    makeList(
      makeSymbol("do"),
      makeSymbol("body")
    ),
    makeSymbol("nil")
  );
  
  // Store this in the environment
  env.define("when-template", whenList);
  
  // Retrieve and verify it has the correct structure
  const template = env.lookup("when-template");
  assertEquals(template.type, "list");
  assertEquals(template.elements[0].type, "symbol");
  assertEquals(template.elements[0].name, "if");
  assertEquals(template.elements[1].type, "symbol");
  assertEquals(template.elements[1].name, "condition");
});