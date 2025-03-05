// test/fx_test.ts
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../src/transpiler/parser.ts";
import { expandMacros } from "../src/macro.ts";
import { transpile } from "../src/transpiler/transformer.ts";
import { ListNode, SymbolNode } from "../src/transpiler/hql_ast.ts";

// ---------- Parsing Tests ----------
Deno.test("fx - parsing basic form", () => {
  const ast = parse('(fx add (x y) (+ x y))');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  const fxNode = ast[0] as ListNode;
  assertEquals(fxNode.elements[0].type, "symbol");
  assertEquals((fxNode.elements[0] as SymbolNode).name, "fx");
});

Deno.test("fx - parsing with return type", () => {
  const ast = parse('(fx add (x y) -> Int (+ x y))');
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  const fxNode = ast[0] as ListNode;
  assertEquals(fxNode.elements[0].type, "symbol");
  assertEquals((fxNode.elements[0] as SymbolNode).name, "fx");
  // Check that "->" is present
  assertEquals(fxNode.elements[3].type, "symbol");
  assertEquals((fxNode.elements[3] as SymbolNode).name, "->");
});

Deno.test("fx - parsing with default parameters", () => {
  const ast = parse('(fx add (x (y = 0)) (+ x y))');
  assertEquals(ast.length, 1);
  const fxNode = ast[0] as ListNode;
  const paramList = fxNode.elements[2] as ListNode;
  assertEquals(paramList.elements.length, 2);
  const yParam = paramList.elements[1] as ListNode;
  assertEquals((yParam.elements[0] as SymbolNode).name, "y");
  assertEquals((yParam.elements[1] as SymbolNode).name, "=");
});

// ---------- Macro Expansion Tests ----------
Deno.test("fx - macro expansion to defun", () => {
  const ast = parse('(fx add (x y) (+ x y))');
  const expanded = expandMacros(ast[0]);
  assertEquals(expanded.type, "list");
  const listNode = expanded as ListNode;
  assertEquals((listNode.elements[0] as SymbolNode).name, "defun");
  assertEquals((listNode.elements[1] as SymbolNode).name, "add");
});

Deno.test("fx - macro expansion with default parameters", () => {
  const ast = parse('(fx add (x (y = 0)) (+ x y))');
  const expanded = expandMacros(ast[0]);
  assertEquals(expanded.type, "list");
  const listNode = expanded as ListNode;
  const paramList = listNode.elements[2] as ListNode;
  let hasOptional = false;
  for (const param of paramList.elements) {
    if (param.type === "symbol" && (param as SymbolNode).name === "&optional") {
      hasOptional = true;
      break;
    }
  }
  assertEquals(hasOptional, true);
});

// ---------- Transpilation Tests ----------

Deno.test("fx - transpile basic form", async () => {
  const source = '(fx add (x y) (+ x y))';
  const result = await transpile(source);
  // Expect a positional function signature.
  assertEquals(result.includes("function add(x, y)"), true);
  assertEquals(result.includes("return (x + y)"), true);
});

Deno.test("fx - transpile with default value", async () => {
  const source = '(fx add (x (y = 0)) (+ x y))';
  const result = await transpile(source);
  // Expect a positional signature with default parameter for y.
  assertEquals(result.includes("function add(x, y = 0)"), true);
  assertEquals(result.includes("return (x + y)"), true);
});

Deno.test("fx - transpile with named parameters", async () => {
  const source = `
    (fx greet-user (name: String title: String) 
      (str "Hello, " title " " name "!"))
    
    (print (greet-user name: "John" title: "Mr."))
  `;
  const result = await transpile(source);
  // Expect positional signature.
  assertEquals(result.includes("function greetUser(name, title)"), true);
  // The call site should be flattened to a positional call.
  assertEquals(result.includes("greetUser(\"John\", \"Mr.\")"), true);
});

Deno.test("fx - transpile with explicit return", async () => {
  const source = '(fx add (x y) (return (+ x y)))';
  const result = await transpile(source);
  // Expect a positional signature.
  assertEquals(result.includes("function add(x, y)"), true);
  assertEquals(result.includes("return (x + y)"), true);
});

Deno.test("fx - transpile with complex body", async () => {
  const source = `
    (fx process-data (data (options = {"verbose": false}))
      (let [
        processed {"result": (get data "value"), "options": options}
      ]
        (return processed)
      ))
  `;
  const result = await transpile(source);
  // Expect a positional signature with default for options.
  assertEquals(result.includes("function processData(data, options = {verbose: false})"), true);
  assertEquals(result.includes("const processed ="), true);
  assertEquals(result.includes("return processed"), true);
});

Deno.test("fx - transpile with kebab case parameters", async () => {
  const source = `
    (fx calculate-total (price: Number qty: Number tax-rate: Number)
      (return (* (* price qty) (+ 1 (/ tax-rate 100)))))
    
    (print (calculate-total price: 19.99 qty: 3 tax-rate: 8.5))
  `;
  const result = await transpile(source);
  // Expect that parameters are converted to camelCase.
  // For example, tax-rate becomes taxRate.
  assertEquals(result.includes("function calculateTotal(price, qty, taxRate)"), true);
  // Expect a positional call (flattened).
  assertEquals(result.includes("calculateTotal(19.99, 3, 8.5)"), true);
});

Deno.test("fx - compatibility with traditional defn", async () => {
  const source = `
    ;; Traditional defn (positional)
    (defn add-traditional (x y)
      (+ x y))
    
    ;; fx form should also compile to positional parameters.
    (fx add-extended (x y)
      (+ x y))
    
    (print (add-traditional 2 3))
    (print (add-extended x: 2 y: 3))
  `;
  const result = await transpile(source);
  // Traditional defn should output a positional signature.
  assertEquals(result.includes("function addTraditional(x, y)"), true);
  // The fx form should also produce a positional signature.
  assertEquals(result.includes("function addExtended(x, y)"), true);
  // Call sites should use positional arguments.
  assertEquals(result.includes("addTraditional(2, 3)"), true);
  assertEquals(result.includes("addExtended(2, 3)"), true);
});
