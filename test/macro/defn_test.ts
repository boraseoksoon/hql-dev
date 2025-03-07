import { assertEquals } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-to-ir.ts";
import { convertIRToTSAST } from "../../src/transpiler/ir-to-ts-ast.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-code.ts";
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";

// Helper function to transpile HQL to JavaScript - now properly async
async function transpileHQL(hqlCode: string): Promise<string> {
  const ast = parse(hqlCode);
  const expandedAST = await expandMacros(ast); // Add await here
  const ir = transformToIR(expandedAST, Deno.cwd());
  const tsAST = convertIRToTSAST(ir);
  const tsCode = generateTypeScript(tsAST);
  
  // Add runtime functions for testing
  const runtime = "function list(...args) { return args; }\n";
  return runtime + tsCode;
}

// Much simpler executeJS that evaluates code directly with Function constructor
async function executeJS(jsCode: string): Promise<any> {
  // Create a temporary module file
  const tempDir = await Deno.makeTempDir();
  const tempFile = path.join(tempDir, "temp_module.js");
  
  try {
    // Extract the function call at the end
    const lines = jsCode.split('\n');
    let lastLine = '';
    
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed && /\w+\(.*\)/.test(trimmed)) {
        lastLine = trimmed;
        break;
      }
    }
    
    if (!lastLine) {
      throw new Error("No function call found in generated code");
    }
    
    // Remove the function call from the code
    const codeWithoutFunctionCall = jsCode.replace(lastLine, '');
    
    // Create a module that wraps the code and captures the result
    const moduleCode = `
      ${codeWithoutFunctionCall}
      
      // Export a function that returns the result of evaluating the code
      export function runTest() {
        try {
          return ${lastLine};
        } catch (error) {
          console.error("Error executing test:", error);
          return undefined;
        }
      }
    `;
    
    await Deno.writeTextFile(tempFile, moduleCode);
    
    // Import the module dynamically
    const moduleUrl = `file://${tempFile}`;
    const module = await import(moduleUrl);
    
    // Run the test function
    return await module.runTest();
  } finally {
    // Clean up temporary files
    try {
      await Deno.remove(tempFile);
      await Deno.remove(tempDir);
    } catch (e) {
      console.warn("Failed to clean up temporary files:", e);
    }
  }
}

// Tests for the defn macro - now using await for transpileHQL
Deno.test("defn macro - basic function", async () => {
  const hqlCode = `
    (defn increment (x) (+ x 1))
    (increment 5)
  `;
  
  const jsCode = await transpileHQL(hqlCode);
  console.log("------- output -------");
  console.log("Generated JS:", jsCode);
  console.log("----- output end -----");
  
  const result = await executeJS(jsCode);
  assertEquals(result, 6);
});

Deno.test("defn macro - function with multiple parameters", async () => {
  const hqlCode = `
    (defn add-three (x y z) (+ (+ x y) z))
    (add-three 1 2 3)
  `;
  
  const jsCode = await transpileHQL(hqlCode);
  console.log("------- output -------");
  console.log("Generated JS:", jsCode);
  console.log("----- output end -----");
  
  const result = await executeJS(jsCode);
  assertEquals(result, 6);
});

Deno.test("defn macro - function with no parameters", async () => {
  const hqlCode = `
    (defn get-ten () 10)
    (get-ten)
  `;
  
  const jsCode = await transpileHQL(hqlCode);
  console.log("------- output -------");
  console.log("Generated JS:", jsCode);
  console.log("----- output end -----");
  
  const result = await executeJS(jsCode);
  assertEquals(result, 10);
});

Deno.test("defn macro - function with do", async () => {
  const hqlCode = `
    (defn calculate (x y)
      (do
        (def sum (+ x y))
        (def product (* x y))
        product))
    (calculate 3 4)
  `;
  
  const jsCode = await transpileHQL(hqlCode);
  console.log("------- output -------");
  console.log("Generated JS:", jsCode);
  console.log("----- output end -----");
  
  const result = await executeJS(jsCode);
  assertEquals(result, 12);
});

Deno.test("defn macro - function with conditional", async () => {
  const hqlCode = `
    (defn max-value (a b)
      (if (> a b) a b))
    (max-value 10 5)
  `;
  
  const jsCode = await transpileHQL(hqlCode);
  console.log("------- output -------");
  console.log("Generated JS:", jsCode);
  console.log("----- output end -----");
  
  const result = await executeJS(jsCode);
  assertEquals(result, 10);
});

Deno.test("defn macro - recursive function", async () => {
  const hqlCode = `
    (defn factorial (n)
      (if (<= n 1)
        1
        (* n (factorial (- n 1)))))
    (factorial 5)
  `;
  
  const jsCode = await transpileHQL(hqlCode);
  console.log("------- output -------");
  console.log("Generated JS:", jsCode);
  console.log("----- output end -----");
  
  const result = await executeJS(jsCode);
  assertEquals(result, 120);
});

Deno.test("defn macro - function with inner function", async () => {
  const hqlCode = `
    (defn outer (x)
      (def inner (fn (y) (* y y)))
      inner)
    (outer 4)
  `;
  
  const jsCode = await transpileHQL(hqlCode);
  console.log("------- output -------");
  console.log("Generated JS:", jsCode);
  console.log("----- output end -----");
  
  const result = await executeJS(jsCode);
  // Just check that we get a function back
  assertEquals(typeof result, "function");
});