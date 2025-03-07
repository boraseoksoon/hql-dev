// test/macros/import_export_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-to-ir.ts";
import { convertIRToTSAST } from "../../src/transpiler/ir-to-ts-ast.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for import and export macros
const IMPORT_EXPORT_SAMPLES = {
  // Basic import
  basicImport: `
    (def path-mod (import "https://deno.land/std@0.170.0/path/mod.ts"))
  `,
  
  // Basic export
  basicExport: `
    (def value 42)
    (export "answer" value)
  `,
  
  // Import and use a module
  importAndUse: `
    (def path-mod (import "https://deno.land/std@0.170.0/path/mod.ts"))
    (def joined (path-mod.join "folder" "file.txt"))
    (export "joined-path" joined)
  `,
  
  // Export multiple values
  multipleExports: `
    (def a 1)
    (def b 2)
    (def c 3)
    (export "a" a)
    (export "b" b)
    (export "c" c)
  `,
  
  // Export expression result
  exportExpression: `
    (export "result" (+ 10 5))
  `,
  
  // Export result of computation
  exportComputation: `
    (do
      (def x 10)
      (def y 20)
      (export "sum" (+ x y)))
  `
};

// Transpile HQL to JavaScript
async function transpileHQL(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  const tsAst = convertIRToTSAST(ir);
  return generateTypeScript(tsAst);
}

// For import/export tests, we can't easily execute the code as it might 
// have side effects or dependencies, so we'll check the generated JS
// structure instead

Deno.test("import macro - basic", async () => {
  const js = await transpileHQL(IMPORT_EXPORT_SAMPLES.basicImport);
  console.log("Generated JS:", js);
  
  // Check that the JS contains an import statement
  assertStringIncludes(js, "import");
  assertStringIncludes(js, "https://deno.land/std@0.170.0/path/mod.ts");
  assertStringIncludes(js, "path_mod");
});

Deno.test("export macro - basic", async () => {
  const js = await transpileHQL(IMPORT_EXPORT_SAMPLES.basicExport);
  console.log("Generated JS:", js);
  
  // Check that the JS contains an export statement
  assertStringIncludes(js, "export");
  assertStringIncludes(js, "answer");
  assertStringIncludes(js, "value");
});

Deno.test("import and export - combined", async () => {
  const js = await transpileHQL(IMPORT_EXPORT_SAMPLES.importAndUse);
  console.log("Generated JS:", js);
  
  // Check that the JS contains both import and export statements
  assertStringIncludes(js, "import");
  assertStringIncludes(js, "path_mod");
  assertStringIncludes(js, "joined");
  assertStringIncludes(js, "export");
  assertStringIncludes(js, "joined-path");
});

Deno.test("export macro - multiple exports", async () => {
  const js = await transpileHQL(IMPORT_EXPORT_SAMPLES.multipleExports);
  console.log("Generated JS:", js);
  
  // Check that the JS contains multiple export statements
  assertStringIncludes(js, "export { a }");
  assertStringIncludes(js, "export { b }");
  assertStringIncludes(js, "export { c }");
});

Deno.test("export macro - expression", async () => {
  const js = await transpileHQL(IMPORT_EXPORT_SAMPLES.exportExpression);
  console.log("Generated JS:", js);
  
  // Check that the JS exports the expression result
  assertStringIncludes(js, "export");
  assertStringIncludes(js, "(10 + 5)");
  assertStringIncludes(js, "result");
});

Deno.test("export macro - with computation", async () => {
  const js = await transpileHQL(IMPORT_EXPORT_SAMPLES.exportComputation);
  console.log("Generated JS:", js);
  
  // Check that the JS exports the computed result
  assertStringIncludes(js, "export");
  assertStringIncludes(js, "sum");
  assertStringIncludes(js, "(x + y)");
});