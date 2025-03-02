// test/parser_test.ts
import { assertEquals, assertThrows } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../src/transpiler/parser.ts";
import { HQLNode, ListNode, LiteralNode, SymbolNode } from "../src/transpiler/hql_ast.ts";
import { ParseError } from "../src/transpiler/errors.ts";

// Helper function to assert equality while ignoring position info for simplicity
function assertAstEqual(actual: HQLNode[], expected: HQLNode[]) {
  assertEquals(JSON.stringify(actual), JSON.stringify(expected));
}

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
  
  ast = parse("123.456");
  assertAstEqual(ast, [{ type: "literal", value: 123.456 }]);
  
  // Booleans
  ast = parse("true");
  assertAstEqual(ast, [{ type: "literal", value: true }]);
  
  ast = parse("false");
  assertAstEqual(ast, [{ type: "literal", value: false }]);
  
  // Null
  ast = parse("null");
  assertAstEqual(ast, [{ type: "literal", value: null }]);
  
  ast = parse("nil");
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

Deno.test("parser - lists and nesting", () => {
  // Simple list
  let ast = parse("(foo bar)");
  assertAstEqual(ast, [{
    type: "list",
    elements: [
      { type: "symbol", name: "foo" },
      { type: "symbol", name: "bar" }
    ]
  }]);
  
  // Nested lists
  ast = parse("(foo (bar baz))");
  assertAstEqual(ast, [{
    type: "list",
    elements: [
      { type: "symbol", name: "foo" },
      {
        type: "list",
        elements: [
          { type: "symbol", name: "bar" },
          { type: "symbol", name: "baz" }
        ]
      }
    ]
  }]);
  
  // Empty list
  ast = parse("()");
  assertAstEqual(ast, [{ type: "list", elements: [] }]);
});

Deno.test("parser - vector syntax with square brackets", () => {
  const ast = parse("[1 2 3]");
  assertAstEqual(ast, [{
    type: "list",
    elements: [
      { type: "literal", value: 1 },
      { type: "literal", value: 2 },
      { type: "literal", value: 3 }
    ],
    isArrayLiteral: true
  }]);
});

Deno.test("parser - mixed expressions", () => {
    const ast = parse('(defn greet [name] (print "Hello, " name "!"))');
    assertAstEqual(ast, [{
      type: "list",
      elements: [
        { type: "symbol", name: "defn" },
        { type: "symbol", name: "greet" },
        {
          type: "list",
          elements: [
            { type: "symbol", name: "name" }
          ]
        },
        {
          type: "list",
          elements: [
            { type: "symbol", name: "print" },
            { type: "literal", value: "Hello, " },
            { type: "symbol", name: "name" },
            { type: "literal", value: "!" }
          ]
        }
      ]
    }]);
  });

Deno.test("parser - comments", () => {
  // Single line comment
  let ast = parse("; This is a comment\nfoo");
  assertAstEqual(ast, [{ type: "symbol", name: "foo" }]);
  
  // Inline comment
  ast = parse("foo ; This is a comment\nbar");
  assertAstEqual(ast, [
    { type: "symbol", name: "foo" },
    { type: "symbol", name: "bar" }
  ]);
  
  // Comment within a list
  ast = parse("(foo ; This is a comment\nbar)");
  assertAstEqual(ast, [{
    type: "list",
    elements: [
      { type: "symbol", name: "foo" },
      { type: "symbol", name: "bar" }
    ]
  }]);
});

Deno.test("parser - string escapes", () => {
  // Basic escapes
  let ast = parse('"Hello\\nWorld"');
  assertAstEqual(ast, [{ type: "literal", value: "Hello\nWorld" }]);
  
  ast = parse('"Tab\\tCharacter"');
  assertAstEqual(ast, [{ type: "literal", value: "Tab\tCharacter" }]);
  
  ast = parse('"Quoted\\"String\\""');
  assertAstEqual(ast, [{ type: "literal", value: 'Quoted"String"' }]);
  
  // HQL interpolation escapes
  ast = parse('"Value: \\(x)"');
  assertAstEqual(ast, [{ type: "literal", value: 'Value: (x)' }]);
});

Deno.test("parser - string with interpolation markers", () => {
  const ast = parse('"Hello, \\(name)!"');
  assertAstEqual(ast, [{ type: "literal", value: "Hello, (name)!" }]);
});

Deno.test("parser - error: unclosed list", () => {
  assertThrows(
    () => parse("(foo bar"),
    ParseError,
    "Unclosed parenthesis"
  );
});

Deno.test("parser - error: unclosed square bracket", () => {
  assertThrows(
    () => parse("[1 2 3"),
    ParseError,
    "Unclosed square bracket"
  );
});

Deno.test("parser - error: unexpected closing parenthesis", () => {
  assertThrows(
    () => parse("foo)"),
    ParseError,
    "Unexpected ')'"
  );
});

Deno.test("parser - error: unexpected closing square bracket", () => {
  assertThrows(
    () => parse("foo]"),
    ParseError,
    "Unexpected ']'"
  );
});

Deno.test("parser - error: unclosed string", () => {
  assertThrows(
    () => parse('"Hello'),
    ParseError,
    "Unclosed string literal"
  );
});

Deno.test("parser - error: invalid escape sequence", () => {
  assertThrows(
    () => parse('"Hello\\z"'),
    ParseError,
    "Invalid escape sequence"
  );
});

Deno.test("parser - multiline code", () => {
  const code = `
    (defn factorial [n]
      (if (= n 0)
        1
        (* n (factorial (- n 1)))))
  `;
  
  const ast = parse(code);
  assertEquals(ast.length, 1);
  assertEquals((ast[0] as ListNode).elements[0].type, "symbol");
  assertEquals(((ast[0] as ListNode).elements[0] as SymbolNode).name, "defn");
});

Deno.test("parser - handling js/interop syntax", () => {
  const ast = parse("js/console.log");
  assertAstEqual(ast, [{ type: "symbol", name: "js/console.log" }]);
});

Deno.test("parser - multiple top-level expressions", () => {
  const code = `
    (def x 10)
    (def y 20)
    (+ x y)
  `;
  
  const ast = parse(code);
  assertEquals(ast.length, 3);
});

Deno.test("parser - whitespace handling", () => {
  // Test that different whitespace patterns are handled equivalently
  const compact = parse("(foo bar)");
  const spaced = parse("( foo   bar )");
  const multiline = parse(`(foo
    bar)`);
  
  assertAstEqual(compact, spaced);
  assertAstEqual(compact, multiline);
});

Deno.test("parser - performance with large input", () => {
  // Generate a large input
  const largeInput = Array(1000).fill('(def x 10)').join('\n');
  
  // Measure parse time
  const start = performance.now();
  const ast = parse(largeInput);
  const end = performance.now();
  
  assertEquals(ast.length, 1000);
  
  // This should parse quickly (adjust threshold as needed)
  const parseTime = end - start;
  console.log(`Large input parse time: ${parseTime}ms`);
  
  // We're not making a strict assertion here, just a sanity check
  // that parsing is reasonably fast
  assert(parseTime < 1000, "Parsing should be reasonably fast");
});

// Helper function for the assertion above
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}