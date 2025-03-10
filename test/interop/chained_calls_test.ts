// test/interop/dot_accessor_test.ts

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-code-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for dot accessors
const SAMPLES = {
  // Basic property access
  mathPI: `(def pi-value (Math.PI))`,
  stringLength: `
    (def message "Hello, World!")
    (def length (message.length))
  `,
  
  // Method calls
  stringToUpper: `
    (def text "hello world")
    (def upper (text.toUpperCase))
  `,
  arrayPush: `
    (def arr [1, 2, 3])
    (arr.push 4)
    (arr.push 5)
  `,
  
  // Chained properties
  dateNowToString: `
    (def now (new Date))
    (def date-str (now.toString))
  `,
  
  // Nested objects
  consoleLog: `
    (console.log "Hello from HQL!")
  `,
  
  // Method with arguments
  mathMax: `
    (def max-value (Math.max 5 10 15))
  `,
  
  // Property access with variable
  dynamicProperty: `
    (def obj {"name": "John", "age": 30})
    (def prop "name")
    (def value (get obj prop))
  `,
  
  // Multi-segment path
  deepProperty: `
    (def config {"db": {"user": {"name": "admin"}}})
    (def admin-name (config.db.user.name))
  `,
  
  // Function returning object, then accessing property
  returnObjectProperty: `
    (defn get-obj () {"value": 42})
    (def obj (get-obj))
    (def value (obj.value))
  `
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Tests for dot accessors
Deno.test("dot accessor - Math.PI", async () => {
  const js = await transpileToJS(SAMPLES.mathPI);
  assertStringIncludes(js, "const pi_value = function ()");
  assertStringIncludes(js, "const _obj = Math");
  assertStringIncludes(js, "PI");
});

Deno.test("dot accessor - string length", async () => {
  const js = await transpileToJS(SAMPLES.stringLength);
  assertStringIncludes(js, "const message = \"Hello, World!\"");
  assertStringIncludes(js, "const length = function ()");
  assertStringIncludes(js, "const _obj = message");
  assertStringIncludes(js, "length");
});

Deno.test("method call - string toUpperCase", async () => {
  const js = await transpileToJS(SAMPLES.stringToUpper);
  assertStringIncludes(js, "const text = \"hello world\"");
  assertStringIncludes(js, "const upper = function ()");
  assertStringIncludes(js, "const _obj = text");
  assertStringIncludes(js, "toUpperCase");
  assertStringIncludes(js, "typeof _member === \"function\" ? _member.call(_obj)");
});

Deno.test("method call - array push", async () => {
  const js = await transpileToJS(SAMPLES.arrayPush);
  assertStringIncludes(js, "const arr = [1, 2, 3]");
  assertStringIncludes(js, "arr.push(4)");
  assertStringIncludes(js, "arr.push(5)");
});

Deno.test("chained properties - date to string", async () => {
  const js = await transpileToJS(SAMPLES.dateNowToString);
  assertStringIncludes(js, "const now = new(Date)");
  assertStringIncludes(js, "const date_str = function ()");
  assertStringIncludes(js, "toString");
});

Deno.test("nested objects - console.log", async () => {
  const js = await transpileToJS(SAMPLES.consoleLog);
  assertStringIncludes(js, "console.log(\"Hello from HQL!\")");
});

Deno.test("method with arguments - Math.max", async () => {
  const js = await transpileToJS(SAMPLES.mathMax);
  assertStringIncludes(js, "const max_value = Math.max(5, 10, 15)");
});

Deno.test("dynamic property access", async () => {
  const js = await transpileToJS(SAMPLES.dynamicProperty);
  assertStringIncludes(js, "const obj = {");
  assertStringIncludes(js, "name: \"John\"");
  assertStringIncludes(js, "age: 30");
  assertStringIncludes(js, "const prop = \"name\"");
  assertStringIncludes(js, "const value = get(obj, prop)");
});

Deno.test("deep property access", async () => {
  const js = await transpileToJS(SAMPLES.deepProperty);
  assertStringIncludes(js, "const config = {");
  assertStringIncludes(js, "db: {");
  assertStringIncludes(js, "user: {");
  assertStringIncludes(js, "name: \"admin\"");
  assertStringIncludes(js, "const admin_name = ");
  // At least one of these patterns should be present
  const hasAccessPattern = js.includes("config.db") || 
                          js.includes("_obj = config") ||
                          js.includes("db.user") ||
                          js.includes("user.name");
  assertEquals(hasAccessPattern, true);
});

Deno.test("function returning object then property access", async () => {
  const js = await transpileToJS(SAMPLES.returnObjectProperty);
  console.log("js : ", js);
  
  // Check for function definition without specifying exact format
  const hasFunction = js.includes("get_obj") && js.includes("function");
  assertEquals(hasFunction, true);
  
  assertStringIncludes(js, "return {");
  assertStringIncludes(js, "value: 42");
  assertStringIncludes(js, "const obj = get_obj()");
  assertStringIncludes(js, "const value = ");
  // Check for the IIFE pattern
  assertStringIncludes(js, "_obj = obj");
});