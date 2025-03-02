// test/parser_test.ts
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { describe, it } from "https://deno.land/std@0.170.0/testing/bdd.ts";
// Update import to remove VectorNode
import { HQLNode, ListNode, LiteralNode, SymbolNode } from "../src/transpiler/hql_ast.ts";
import { parse } from "../src/transpiler/parser.ts";

describe("Parser", () => {
  it("parses a simple expression", () => {
    const parsed = parse("(+ 1 2)");
    assertEquals(parsed.length, 1);
    const expr = parsed[0] as ListNode;
    assertEquals(expr.type, "list");
    assertEquals(expr.elements.length, 3);
    
    const op = expr.elements[0] as SymbolNode;
    assertEquals(op.type, "symbol");
    assertEquals(op.name, "+");
    
    const arg1 = expr.elements[1] as LiteralNode;
    assertEquals(arg1.type, "literal");
    assertEquals(arg1.value, 1);
    
    const arg2 = expr.elements[2] as LiteralNode;
    assertEquals(arg2.type, "literal");
    assertEquals(arg2.value, 2);
  });
  
  it("parses multiple expressions", () => {
    const parsed = parse("(+ 1 2)\n(- 3 4)");
    assertEquals(parsed.length, 2);
    
    const expr1 = parsed[0] as ListNode;
    assertEquals(expr1.type, "list");
    assertEquals(expr1.elements.length, 3);
    
    const expr2 = parsed[1] as ListNode;
    assertEquals(expr2.type, "list");
    assertEquals(expr2.elements.length, 3);
  });
  
  it("parses nested expressions", () => {
    const parsed = parse("(+ 1 (* 2 3))");
    assertEquals(parsed.length, 1);
    
    const expr = parsed[0] as ListNode;
    assertEquals(expr.type, "list");
    assertEquals(expr.elements.length, 3);
    
    const nested = expr.elements[2] as ListNode;
    assertEquals(nested.type, "list");
    assertEquals(nested.elements.length, 3);
  });
  
  it("parses string literals", () => {
    const parsed = parse("(greet \"Hello, world!\")");
    assertEquals(parsed.length, 1);
    
    const expr = parsed[0] as ListNode;
    assertEquals(expr.type, "list");
    assertEquals(expr.elements.length, 2);
    
    const str = expr.elements[1] as LiteralNode;
    assertEquals(str.type, "literal");
    assertEquals(str.value, "Hello, world!");
  });
  
  it("parses vector literals", () => {
    const parsed = parse("(def my-vector [1 2 3 4])");
    assertEquals(parsed.length, 1);
    
    const expr = parsed[0] as ListNode;
    assertEquals(expr.type, "list");
    assertEquals(expr.elements.length, 3);
    
    // Vector is now a literal with array value
    const vector = expr.elements[2] as LiteralNode;
    assertEquals(vector.type, "literal");
    assertEquals(Array.isArray(vector.value), true);
    
    // Check array values
    const arr = vector.value as number[];
    assertEquals(arr.length, 4);
    assertEquals(arr[0], 1);
    assertEquals(arr[1], 2);
    assertEquals(arr[2], 3);
    assertEquals(arr[3], 4);
  });
  
  it("parses nested vectors", () => {
    const parsed = parse("(def nested-vector [[1 2] [3 4]])");
    assertEquals(parsed.length, 1);
    
    const expr = parsed[0] as ListNode;
    assertEquals(expr.type, "list");
    assertEquals(expr.elements.length, 3);
    
    // Nested vector is a literal with nested array value
    const vector = expr.elements[2] as LiteralNode;
    assertEquals(vector.type, "literal");
    assertEquals(Array.isArray(vector.value), true);
    
    // Check array values
    const arr = vector.value as any[];
    assertEquals(arr.length, 2);
    assertEquals(Array.isArray(arr[0]), true);
    assertEquals(Array.isArray(arr[1]), true);
    assertEquals(arr[0][0], 1);
    assertEquals(arr[0][1], 2);
    assertEquals(arr[1][0], 3);
    assertEquals(arr[1][1], 4);
  });
  
  it("parses boolean literals", () => {
    const parsed = parse("(and true false)");
    assertEquals(parsed.length, 1);
    
    const expr = parsed[0] as ListNode;
    assertEquals(expr.type, "list");
    assertEquals(expr.elements.length, 3);
    
    const t = expr.elements[1] as LiteralNode;
    assertEquals(t.type, "literal");
    assertEquals(t.value, true);
    
    const f = expr.elements[2] as LiteralNode;
    assertEquals(f.type, "literal");
    assertEquals(f.value, false);
  });
  
  it("parses null/nil", () => {
    const parsed = parse("(check-null null nil)");
    assertEquals(parsed.length, 1);
    
    const expr = parsed[0] as ListNode;
    assertEquals(expr.type, "list");
    assertEquals(expr.elements.length, 3);
    
    const n1 = expr.elements[1] as LiteralNode;
    assertEquals(n1.type, "literal");
    assertEquals(n1.value, null);
    
    const n2 = expr.elements[2] as LiteralNode;
    assertEquals(n2.type, "literal");
    assertEquals(n2.value, null);
  });
  
  it("parses set literals", () => {
    const parsed = parse("(def my-set #[1 2 3 4])");
    assertEquals(parsed.length, 1);
    
    const expr = parsed[0] as ListNode;
    assertEquals(expr.type, "list");
    assertEquals(expr.elements.length, 3);
    
    // Set is now a literal with Set value
    const set = expr.elements[2] as LiteralNode;
    assertEquals(set.type, "literal");
    assertEquals(set.value instanceof Set, true);
    
    // Check set values
    const s = set.value as Set<number>;
    assertEquals(s.size, 4);
    assertEquals(s.has(1), true);
    assertEquals(s.has(2), true);
    assertEquals(s.has(3), true);
    assertEquals(s.has(4), true);
  });
  
  it("parses map literals", () => {
    const parsed = parse('(def my-map {"name": "Alice", "age": 30})');
    assertEquals(parsed.length, 1);
    
    const expr = parsed[0] as ListNode;
    assertEquals(expr.type, "list");
    assertEquals(expr.elements.length, 3);
    
    // Map is now a literal with object value
    const map = expr.elements[2] as LiteralNode;
    assertEquals(map.type, "literal");
    assertEquals(typeof map.value, "object");
    assertEquals(map.value !== null, true);
    
    // Check object values
    const obj = map.value as Record<string, any>;
    assertEquals(obj.name, "Alice");
    assertEquals(obj.age, 30);
  });
  
  it("handles comments", () => {
    const parsed = parse(`;; This is a comment
(+ 1 2) ;; This is an inline comment
;; Another comment
(- 3 4)`);
    assertEquals(parsed.length, 2);
  });
});