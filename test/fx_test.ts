// Updated test/fx_test.ts with logging
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../src/transpiler/parser.ts";
import { expandMacros } from "../src/macro.ts";
import { transpile } from "../src/transpiler/transformer.ts";
import { ListNode, SymbolNode } from "../src/transpiler/hql_ast.ts";

// Add this helper function to log test results
function logResult(testName: string, result: string) {
  console.log(`\n----- TEST: ${testName} -----`);
  console.log(result);
  console.log("----- END TEST OUTPUT -----\n");
}

// Test the parser's handling of fx forms
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
  
  // Check that -> is present
  assertEquals(fxNode.elements[3].type, "symbol");
  assertEquals((fxNode.elements[3] as SymbolNode).name, "->");
});

Deno.test("fx - parsing with default parameters", () => {
  const ast = parse('(fx add (x (y = 0)) (+ x y))');
  
  assertEquals(ast.length, 1);
  assertEquals(ast[0].type, "list");
  
  const fxNode = ast[0] as ListNode;
  
  // Check the param list  
  const paramList = fxNode.elements[2] as ListNode;
  assertEquals(paramList.elements.length, 2);
  
  // Check for default value specification
  const yParam = paramList.elements[1] as ListNode;
  assertEquals((yParam.elements[0] as SymbolNode).name, "y");
  assertEquals((yParam.elements[1] as SymbolNode).name, "=");
});

// Test macro expansion of fx forms
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
  
  // Check for &optional in params
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

// Test transpilation of fx forms
Deno.test("fx - transpile basic form", async () => {
  const source = '(fx add (x y) (+ x y))';
  const result = await transpile(source);
  
  logResult("transpile basic form", result);
  
  assertEquals(result.includes("function add("), true);
  assertEquals(result.includes("return (x + y)"), true);
});

Deno.test("fx - transpile with default value", async () => {
  const source = '(fx add (x (y = 0)) (+ x y))';
  const result = await transpile(source);
  
  logResult("transpile with default value", result);
  
  // Ensure proper transformation of the default value
  assertEquals(result.includes("function add("), true);
  // In the expanded form, y will have a default parameter
  assertEquals(result.includes("y = 0"), true);
  assertEquals(result.includes("return (x + y)"), true);
});

Deno.test("fx - transpile with named parameters", async () => {
  const source = `
    (fx greet-user (name: String title: String) 
      (str "Hello, " title " " name "!"))
    
    (print (greet-user name: "John" title: "Mr."))
  `;
  const result = await transpile(source);
  
  logResult("transpile with named parameters", result);
  
  assertEquals(result.includes("function greetUser("), true);
  // Should handle named parameters as a destructured object
  assertEquals(result.includes("name, title"), true);
  assertEquals(result.includes("{name: \"John\", title: \"Mr.\"}"), true);
});

Deno.test("fx - transpile with explicit return", async () => {
  const source = '(fx add (x y) (return (+ x y)))';
  const result = await transpile(source);
  
  logResult("transpile with explicit return", result);
  
  assertEquals(result.includes("function add("), true);
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
  
  console.log("Source for complex body test:");
  console.log(source);
  
  try {
    const ast = parse(source);
    console.log("AST for complex body:");
    console.log(JSON.stringify(ast, null, 2));
    
    const expanded = expandMacros(ast[0]);
    console.log("Expanded for complex body:");
    console.log(JSON.stringify(expanded, null, 2));
    
    const result = await transpile(source);
    logResult("transpile with complex body", result);
    
    assertEquals(result.includes("function processData("), true);
    assertEquals(result.includes("options = {"), true);
    assertEquals(result.includes("verbose: false"), true);
    assertEquals(result.includes("const processed = {"), true);
    assertEquals(result.includes("result: data.value"), true);
    assertEquals(result.includes("return processed"), true);
  } catch (error) {
    console.error("Error in complex body test:", error);
    throw error;
  }
});

// Test with kebab-case to camelCase conversion
Deno.test("fx - transpile with kebab case parameters", async () => {
  const source = `
    (fx calculate-total (price: Number qty: Number tax-rate: Number)
      (return (* (* price qty) (+ 1 (/ tax-rate 100)))))
    
    (print (calculate-total price: 19.99 qty: 3 tax-rate: 8.5))
  `;
  
  const result = await transpile(source);
  logResult("transpile with kebab case", result);
  
  assertEquals(result.includes("function calculateTotal("), true);
  // Check for camelCase conversion in parameters
  assertEquals(result.includes("taxRate"), true);
  assertEquals(result.includes("tax-rate"), false); // Should NOT include kebab case
});

// Compatibility with traditional forms
Deno.test("fx - compatibility with traditional defn", async () => {
  const source = `
    ;; Traditional way
    (defn add-traditional (x y)
      (+ x y))
    
    ;; New way with fx
    (fx add-extended (x y)
      (+ x y))
    
    (print (add-traditional 2 3))
    (print (add-extended x: 2 y: 3))
  `;
  const result = await transpile(source);
  
  logResult("compatibility with traditional defn", result);
  
  // Both should be valid functions in the output
  assertEquals(result.includes("function addTraditional(x, y)"), true);
  assertEquals(result.includes("function addExtended("), true);
  assertEquals(result.includes("addTraditional(2, 3)"), true);
  assertEquals(result.includes("addExtended({x: 2, y: 3})"), true);
});