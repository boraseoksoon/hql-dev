// test/parser_test.ts
import { parse, ParseError } from "../src/parser.ts";
import { assertEquals, assertThrows } from "https://deno.land/std@0.170.0/testing/asserts.ts";

Deno.test("Basic syntax parsing", () => {
  // Test simple form
  const result1 = parse("(def x 10)");
  assertEquals(result1.length, 1);
  assertEquals(result1[0].type, "list");
  const list = result1[0] as any;
  assertEquals(list.elements.length, 3);
  assertEquals(list.elements[0].type, "symbol");
  assertEquals(list.elements[0].name, "def");
  assertEquals(list.elements[1].type, "symbol");
  assertEquals(list.elements[1].name, "x");
  assertEquals(list.elements[2].type, "literal");
  assertEquals(list.elements[2].value, 10);
  
  // Test nested forms
  const result2 = parse("(def fn (fn (x) (+ x 1)))");
  assertEquals(result2.length, 1);
  assertEquals(result2[0].type, "list");
  const list2 = result2[0] as any;
  assertEquals(list2.elements.length, 3);
  assertEquals(list2.elements[2].type, "list");
});

Deno.test("Comment handling", () => {
  // Line comments
  const result1 = parse(`
    ;; This is a comment
    (def x 10)
  `);
  assertEquals(result1.length, 1);
  
  // Inline comments
  const result2 = parse(`(def y 20) ;; This is an inline comment`);
  assertEquals(result2.length, 1);
  assertEquals(result2[0].type, "list");
  const list = result2[0] as any;
  assertEquals(list.elements.length, 3);
  assertEquals(list.elements[2].value, 20);
  
  // Multiple lines with comments
  const result3 = parse(`
    ;; Comment 1
    (def a 1)
    ;; Comment 2
    (def b 2)
  `);
  assertEquals(result3.length, 2);
});

Deno.test("String literals", () => {
  // Regular string
  const result1 = parse('(def greeting "Hello, world!")');
  assertEquals(result1[0].type, "list");
  const list1 = result1[0] as any;
  assertEquals(list1.elements[2].value, "Hello, world!");
  
  // String with escape sequences
  const result2 = parse('(def escaped "Line 1\\nLine 2\\tTabbed\\rReturn\\\"Quote\\\\Backslash")');
  assertEquals(result2[0].type, "list");
  const list2 = result2[0] as any;
  assertEquals(list2.elements[2].value, "Line 1\nLine 2\tTabbed\rReturn\"Quote\\Backslash");
  
  // Multi-line string
  const result3 = parse(`(def multiline "This is a
multi-line string
with three lines")`);
  assertEquals(result3[0].type, "list");
  const list3 = result3[0] as any;
  assertEquals(list3.elements[2].value, "This is a\nmulti-line string\nwith three lines");
  
  // Unicode string
  const result4 = parse('(def unicode "Unicode: こんにちは世界")');
  assertEquals(result4[0].type, "list");
  const list4 = result4[0] as any;
  assertEquals(list4.elements[2].value, "Unicode: こんにちは世界");
});

Deno.test("Error handling", () => {
  // Unclosed parenthesis
  assertThrows(
    () => parse("(def x 10"),
    ParseError,
    "Unclosed parenthesis"
  );
  
  // Unclosed string
  assertThrows(
    () => parse('(def greeting "Hello'),
    ParseError,
    "Unclosed string literal"
  );
  
  // Invalid escape sequence
  assertThrows(
    () => parse('(def bad "Invalid \\z escape")'),
    ParseError,
    "Invalid escape sequence"
  );
  
  // Extra closing parenthesis
  assertThrows(
    () => parse("(def x 10))"),
    ParseError,
    "Unexpected ')'"
  );
});

// Run all tests
if (import.meta.main) {
  console.log("Running parser tests...");
}