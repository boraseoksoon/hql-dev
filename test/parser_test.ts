// test/parser_test.ts
import { assertEquals, assertThrows } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse, ParseError } from "../src/transpiler/parser.ts";

// Basic HQL parsing
Deno.test("Parse basic HQL expressions", () => {
  // Simple def statement
  const ast1 = parse('(def greeting "Hello, world!")');
  assertEquals(ast1.length, 1);
  assertEquals(ast1[0].type, "list");
  if (ast1[0].type === "list") {
    assertEquals(ast1[0].elements.length, 3);
    assertEquals(ast1[0].elements[0].type, "symbol");
    assertEquals(ast1[0].elements[1].type, "symbol");
    assertEquals(ast1[0].elements[2].type, "literal");
    
    if (ast1[0].elements[0].type === "symbol" && 
        ast1[0].elements[1].type === "symbol" && 
        ast1[0].elements[2].type === "literal") {
      assertEquals(ast1[0].elements[0].name, "def");
      assertEquals(ast1[0].elements[1].name, "greeting");
      assertEquals(ast1[0].elements[2].value, "Hello, world!");
    }
  }
  
  // Basic function definition
  const ast2 = parse(`
    (defn add [x y]
      (+ x y))
  `);
  assertEquals(ast2.length, 1);
  assertEquals(ast2[0].type, "list");
  if (ast2[0].type === "list") {
    assertEquals(ast2[0].elements.length, 4);
    assertEquals(ast2[0].elements[0].type, "symbol");
    if (ast2[0].elements[0].type === "symbol") {
      assertEquals(ast2[0].elements[0].name, "defn");
    }
  }
});

// String literals with escapes
Deno.test("Parse string literals with escapes", () => {
  const ast = parse('(def escaped "Line 1\\nLine 2\\tTabbed\\\\Backslash\\"Quote")');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  if (ast[0].type === "list" && ast[0].elements[2].type === "literal") {
    assertEquals(ast[0].elements[2].value, "Line 1\nLine 2\tTabbed\\Backslash\"Quote");
  }
});

// Boolean and null literals
Deno.test("Parse boolean and null literals", () => {
  const ast = parse(`
    (def t true)
    (def f false)
    (def n null)
    (def nil-val nil)
  `);
  assertEquals(ast.length, 4);
  
  // True
  if (ast[0].type === "list" && ast[0].elements[2].type === "literal") {
    assertEquals(ast[0].elements[2].value, true);
  }
  
  // False
  if (ast[1].type === "list" && ast[1].elements[2].type === "literal") {
    assertEquals(ast[1].elements[2].value, false);
  }
  
  // Null
  if (ast[2].type === "list" && ast[2].elements[2].type === "literal") {
    assertEquals(ast[2].elements[2].value, null);
  }
  
  // Nil
  if (ast[3].type === "list" && ast[3].elements[2].type === "literal") {
    assertEquals(ast[3].elements[2].value, null);
  }
});

// Numeric literals
Deno.test("Parse numeric literals", () => {
  const ast = parse(`
    (def int 42)
    (def float 3.14159)
    (def negative -10)
  `);
  assertEquals(ast.length, 3);
  
  // Integer
  if (ast[0].type === "list" && ast[0].elements[2].type === "literal") {
    assertEquals(ast[0].elements[2].value, 42);
  }
  
  // Float
  if (ast[1].type === "list" && ast[1].elements[2].type === "literal") {
    assertEquals(ast[1].elements[2].value, 3.14159);
  }
  
  // Negative
  if (ast[2].type === "list" && ast[2].elements[2].type === "literal") {
    assertEquals(ast[2].elements[2].value, -10);
  }
});

// Nested expressions
Deno.test("Parse nested expressions", () => {
  const ast = parse(`
    (defn area-circle [radius]
      (* 3.14159 (* radius radius)))
  `);
  assertEquals(ast.length, 1);
  
  if (ast[0].type === "list") {
    // Check function body (* 3.14159 (* radius radius))
    const bodyExpr = ast[0].elements[3];
    assertEquals(bodyExpr.type, "list");
    
    if (bodyExpr.type === "list") {
      // Check nested (* radius radius)
      const nestedExpr = bodyExpr.elements[2];
      assertEquals(nestedExpr.type, "list");
      
      if (nestedExpr.type === "list") {
        assertEquals(nestedExpr.elements.length, 3);
        assertEquals(nestedExpr.elements[0].type, "symbol");
        
        if (nestedExpr.elements[0].type === "symbol") {
          assertEquals(nestedExpr.elements[0].name, "*");
        }
      }
    }
  }
});

// Comment handling
Deno.test("Handle comments correctly", () => {
  const ast = parse(`
    ;; This is a full line comment
    (def x 1) ;; This is an inline comment
    ;; Another comment
    (def y 2)
  `);
  assertEquals(ast.length, 2);
  
  if (ast[0].type === "list" && ast[0].elements[2].type === "literal") {
    assertEquals(ast[0].elements[2].value, 1);
  }
  
  if (ast[1].type === "list" && ast[1].elements[2].type === "literal") {
    assertEquals(ast[1].elements[2].value, 2);
  }
});

// Error cases
Deno.test("Throw error for unclosed string", () => {
  assertThrows(
    () => parse('(def greeting "Hello, world!);'),
    ParseError,
    "Unclosed string literal"
  );
});

Deno.test("Throw error for unclosed parenthesis", () => {
  assertThrows(
    () => parse('(def greeting "Hello"'),
    ParseError,
    "Unclosed parenthesis"
  );
});

Deno.test("Throw error for unexpected closing parenthesis", () => {
  assertThrows(
    () => parse('(def greeting "Hello"))'),
    ParseError,
    "Unexpected ')'"
  );
});

Deno.test("Throw error for invalid escape sequence", () => {
  assertThrows(
    () => parse('(def greeting "Hello\\z")'),
    ParseError,
    "Invalid escape sequence"
  );
});