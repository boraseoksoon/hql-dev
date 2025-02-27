// test/transformer_test.ts
import { parse } from "../src/transpiler/parser.ts";
import { transformAST } from "../src/transpiler/transformer.ts";
import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";

// Helper function to parse and transform HQL code
async function transformHQL(hql: string): Promise<string> {
  const ast = parse(hql);
  return await transformAST(ast, Deno.cwd(), new Set());
}

// Helper function to remove whitespace and normalize for comparison
function normalizeJS(js: string): string {
  return js.replace(/\s+/g, ' ').trim();
}

// Helper function to compare JS with test case
async function assertTransformation(hql: string, expectedJS: string, message?: string): Promise<void> {
  const js = await transformHQL(hql);
  const normalizedActual = normalizeJS(js);
  const normalizedExpected = normalizeJS(expectedJS);
  
  assertEquals(normalizedActual, normalizedExpected, message || "Transformed code doesn't match expected output");
}

// Test basic transformations
Deno.test("Basic variable declarations", async () => {
  await assertTransformation(
    `(def x 42)
     (print x)`,
    `const x = 42;
     console.log(x);`
  );
});

// Test with simple string literals
Deno.test("String literals", async () => {
  await assertTransformation(
    `(def greeting "Hello, world!")
     (print greeting)`,
    `const greeting = "Hello, world!";
     console.log(greeting);`
  );
});

// Test function definition and call with positional parameters
Deno.test("Function with positional parameters", async () => {
  await assertTransformation(
    `(defn add (a b)
       (+ a b))
     (print (add 2 3))`,
    `function add(a, b) {
       return (a + b);
     }
     console.log(add(2, 3));`
  );
});

// Test function definition and call with named parameters
Deno.test("Function with named parameters", async () => {
  await assertTransformation(
    `(defn subtract (x: Number y: Number)
       (- x y))
     (print (subtract x: 10 y: 5))`,
    `function subtract(params) {
       const { x: x, y: y } = params;
       return (x - y);
     }
     console.log(subtract({ x: 10, y: 5 }));`
  );
});

// Test function with type annotation and named parameters
Deno.test("Function with return type and named params", async () => {
  await assertTransformation(
    `(defn multiply (x: Number y: Number) (-> Number)
       (* x y))
     (print (multiply x: 4 y: 5))`,
    `function multiply(params) {
       const { x: x, y: y } = params;
       return (x * y);
     }
     console.log(multiply({ x: 4, y: 5 }));`
  );
});

// Test hyphenated identifiers
Deno.test("Hyphenated identifiers", async () => {
  const hql = `(defn calculate-area (width: Number height: Number)
                 (* width height))
               (print (calculate-area width: 5 height: 10))`;
  
  const js = await transformHQL(hql);
  
  // Check for camelCase conversion of function name
  if (!js.includes("function calculateArea")) {
    throw new Error(`Expected "function calculateArea" but got: ${js}`);
  }
  
  // Check for camelCase conversion in function call
  if (!js.includes("calculateArea({")) {
    throw new Error(`Expected "calculateArea({" but got: ${js}`);
  }
});

// Test anonymous functions with named and positional parameters
Deno.test("Anonymous functions", async () => {
  const hql = `(def add-fn (fn (a b) (+ a b)))
               (def typed-fn (fn (x: Number y: Number) (-> Number) (* x y)))
               (print (add-fn 10 20))
               (print (typed-fn x: 5 y: 6))`;
  
  const js = await transformHQL(hql);
  
  // Check for the correct function declarations
  if (!js.includes("const addFn = function(a, b)")) {
    throw new Error(`Expected anonymous function but got: ${js}`);
  }
  
  if (!js.includes("const typedFn = function(params)")) {
    throw new Error(`Expected anonymous function with params but got: ${js}`);
  }
  
  // Check for proper function calls
  if (!js.includes("console.log(addFn(10, 20))")) {
    throw new Error(`Expected function call with normal args but got: ${js}`);
  }
  
  if (!js.includes("console.log(typedFn({ x: 5, y: 6 }))")) {
    throw new Error(`Expected function call with named args but got: ${js}`);
  }
});

// Test higher-order functions (functions that return functions)
Deno.test("Higher-order functions", async () => {
  const hql = `(defn make-adder (increment: Number)
                 (fn (x) (+ x increment)))
               (def add5 (make-adder increment: 5))
               (print (add5 10))`;
  
  const js = await transformHQL(hql);
  
  // Check for correct higher-order function implementation
  if (!js.includes("function makeAdder(params)") || 
      !js.includes("const { increment: increment } = params") ||
      !js.includes("return function(x)") ||
      !js.includes("return (x + increment)")) {
    throw new Error(`Higher-order function not correctly implemented. Got: ${js}`);
  }
  
  // Check for proper function calls
  if (!js.includes("const add5 = makeAdder({ increment: 5 })") ||
      !js.includes("console.log(add5(10))")) {
    throw new Error(`Higher-order function call not correctly implemented. Got: ${js}`);
  }
});

// Test string interpolation
Deno.test("String interpolation", async () => {
  const hql = `(def name "World")
               (def greeting "Hello, \\(name)!")`;
  
  const js = await transformHQL(hql);
  
  // Check for proper template string
  if (!js.includes("`Hello, ${name}!`")) {
    throw new Error(`Expected template string but got: ${js}`);
  }
});

// Test nested arithmetic expressions
Deno.test("Nested arithmetic", async () => {
  const hql = `(def result (+ (* 10 3) (/ 100 (+ 10 10))))`;
  const js = await transformHQL(hql);
  
  // Check for properly nested arithmetic expressions
  const normalizedJS = normalizeJS(js);
  assertEquals(
    normalizedJS.includes("const result = ((10 * 3) + (100 / (10 + 10)))") || 
    normalizedJS.includes("const result = ((10 * 3) + (100 / (10 + 10)));"),
    true,
    `Expected nested arithmetic but got: ${normalizedJS}`
  );
});

// Test data structures
Deno.test("Data structures", async () => {
  await assertTransformation(
    `(def arr (list 1 2 3))
     (def vec (vector 4 5 6))
     (def obj (hash-map (keyword "a") 100 (keyword "b") 200))`,
    `const arr = [1, 2, 3];
     const vec = [4, 5, 6];
     const obj = {[":a"]: 100, [":b"]: 200};`
  );
});

// Test property access
Deno.test("Property access", async () => {
  await assertTransformation(
    `(def name (get obj "name"))
     (def age (get obj "age"))
     (def complex-prop (get obj "complex-name"))`,
    `const name = obj.name;
     const age = obj.age;
     const complexProp = obj["complex-name"];`
  );
});

// Test new expressions
Deno.test("New expressions", async () => {
  await assertTransformation(
    `(def date (new Date))
     (def array (new Array 1 2 3))
     (def set (new Set (list 1 2 3)))`,
    `const date = new Date();
     const array = new Array(1, 2, 3);
     const set = new Set([1, 2, 3]);`
  );
});

// Test complex function composition
Deno.test("Function composition with named parameters", async () => {
  await assertTransformation(
    `(defn format-greeting (name: String title: String)
       (str "Hello, " title " " name))
     (print (format-greeting name: "Smith" title: "Mr."))`,
    `function formatGreeting(params) {
       const { name: name, title: title } = params;
       return "Hello, " + title + " " + name;
     }
     console.log(formatGreeting({ name: "Smith", title: "Mr." }));`
  );
});

// Test enum definitions
Deno.test("Enum definition", async () => {
  await assertTransformation(
    `(defenum Color red green blue)
     (def selected-color Color.red)`,
    `const Color = { red: "red", green: "green", blue: "blue" };
     const selectedColor = Color.red;`
  );
});

// Test exports
Deno.test("Export declarations", async () => {
  await assertTransformation(
    `(def greeting "Hello")
     (defn say-hello (name) (str greeting ", " name))
     (export "sayHello" say-hello)
     (export "GREETING" greeting)`,
    `const greeting = "Hello";
     function sayHello(name) {
       return greeting + ", " + name;
     }
     export { sayHello as sayHello };
     export { greeting as GREETING };`
  );
});

// Run all tests
if (import.meta.main) {
  console.log("Running transformer tests...");
}