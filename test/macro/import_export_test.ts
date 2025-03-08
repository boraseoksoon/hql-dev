// test/macro/import_export_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-to-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for import and export macros
const SAMPLES = {
  basicImport: `(import "https://deno.land/std@0.170.0/path/mod.ts")
               (def path-mod mod)`,
  
  basicExport: `(def value 42)
               (export "answer" value)`,
  
  combinedImportExport: `(import "https://deno.land/std@0.170.0/path/mod.ts")
                        (def path-mod mod)
                        (def joined (path-mod.join "folder" "file.txt"))
                        (export "joined_path" joined)`,
  
  multipleExports: `(def a 1)
                   (def b 2)
                   (def c 3)
                   (export "a" a)
                   (export "b" b)
                   (export "c" c)`,
  
  exportExpression: `(export "result" (+ 10 5))`,
  
  exportComputation: `(export "result" (do
                                       (def x 10)
                                       (def y 20)
                                       (+ x y)))`
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Tests for import and export macros
Deno.test("import macro - basic", async () => {
  const js = await transpileToJS(SAMPLES.basicImport);
  assertStringIncludes(js, "import * as");
  assertStringIncludes(js, "https://deno.land/std@0.170.0/path/mod.ts");
  assertStringIncludes(js, "const path_mod");
});

Deno.test("export macro - basic", async () => {
  const js = await transpileToJS(SAMPLES.basicExport);
  assertStringIncludes(js, "const value = 42");
  assertStringIncludes(js, "export { value as answer }");
});

Deno.test("import and export - combined", async () => {
  const js = await transpileToJS(SAMPLES.combinedImportExport);
  assertStringIncludes(js, "import * as");
  assertStringIncludes(js, "const path_mod");
  assertStringIncludes(js, "path_mod.join");
  assertStringIncludes(js, "folder");
  assertStringIncludes(js, "file.txt");
  assertStringIncludes(js, "export { joined as joined_path }");
});

Deno.test("export macro - multiple exports", async () => {
  const js = await transpileToJS(SAMPLES.multipleExports);
  assertStringIncludes(js, "const a = 1");
  assertStringIncludes(js, "const b = 2");
  assertStringIncludes(js, "const c = 3");
  assertStringIncludes(js, "export { a }");
  assertStringIncludes(js, "export { b }");
  assertStringIncludes(js, "export { c }");
});

Deno.test("export macro - expression", async () => {
  const js = await transpileToJS(SAMPLES.exportExpression);
  assertStringIncludes(js, "export");
  assertStringIncludes(js, "result");
  assertStringIncludes(js, "10 + 5");
});

Deno.test("export macro - with computation", async () => {
  const js = await transpileToJS(SAMPLES.exportComputation);
  assertStringIncludes(js, "function()");
  assertStringIncludes(js, "const x = 10");
  assertStringIncludes(js, "const y = 20");
  assertStringIncludes(js, "x + y");
  assertStringIncludes(js, "export");
  assertStringIncludes(js, "result");
});