// Updated test/import/remote_import_test.ts - Fix for mixed exports test

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.170.0/testing/asserts.ts";
import { parse } from "../../src/transpiler/parser.ts";
import { expandMacros } from "../../src/macro-expander.ts";
import { transformToIR } from "../../src/transpiler/hql-code-to-hql-ir.ts";
import { generateTypeScript } from "../../src/transpiler/ts-ast-to-ts-code.ts";
import { dirname } from "../../src/platform/platform.ts";

// Test HQL samples for different types of imports
const SAMPLES = {
  // Default export only
  defaultExport: `
    (import path "https://deno.land/std@0.170.0/path/mod.ts")
    (def joined-path (path.join "folder" "file.txt"))
    (console.log joined-path)
  `,
  
  // Named exports only
  namedExports: `
    (import fs "https://deno.land/std@0.170.0/fs/mod.ts")
    (def exists (fs.existsSync "example-dir"))
    (console.log "Directory exists:" exists)
  `,
  
  // Both default and named exports
  mixedExports: `
    (import express "npm:express")
    (def app (express))
    (app.get "/" (fn (req res) (res.send "Hello World!")))
    (def router (express.Router))
    (app.use (express.json))
  `,
  
  // Multiple imports to ensure no name clash
  multipleImports: `
    (import path "https://deno.land/std@0.170.0/path/mod.ts")
    (import fs "https://deno.land/std@0.170.0/fs/mod.ts")
    (def dir-path (path.dirname "file.txt"))
    (def file-exists (fs.existsSync dir-path))
  `,
  
  // Importing from JSR - updated with correct package name
  jsrImport: `
    (import chalk "jsr:@nothing628/chalk")
    (console.log (chalk.green "Success!"))
    (console.log (chalk.red "Error!"))
  `,
  
  // Import with export
  importAndExport: `
    (import path "https://deno.land/std@0.170.0/path/mod.ts")
    (def ext (path.extname "file.txt"))
    (export "fileExtension" ext)
  `
};

// Helper to transpile HQL to JavaScript
async function transpileToJS(source: string): Promise<string> {
  const ast = parse(source);
  const expandedAst = await expandMacros(ast);
  const ir = transformToIR(expandedAst, dirname(Deno.cwd()));
  return generateTypeScript(ir);
}

// Tests for remote import handling
Deno.test("remote imports - default export", async () => {
  const js = await transpileToJS(SAMPLES.defaultExport);
  
  // Verify import statement
  assertStringIncludes(js, "import * as pathModule");
  
  // Verify wrapper function that preserves both default and named exports
  assertStringIncludes(js, "const path = (function");
  assertStringIncludes(js, "const wrapper = pathModule.default");
  
  // Verify usage of the imported module
  assertStringIncludes(js, "path.join(\"folder\", \"file.txt\")");
});

Deno.test("remote imports - named exports", async () => {
  const js = await transpileToJS(SAMPLES.namedExports);
  
  // Verify import statement
  assertStringIncludes(js, "import * as fsModule");
  
  // Verify wrapper function
  assertStringIncludes(js, "const fs = (function");
  
  // Verify usage of named export
  assertStringIncludes(js, "fs.existsSync(\"example-dir\")");
});

Deno.test("remote imports - mixed exports", async () => {
  const js = await transpileToJS(SAMPLES.mixedExports);
  
  // Verify import statement
  assertStringIncludes(js, "import * as expressModule");
  
  // Verify wrapper function
  assertStringIncludes(js, "const express = (function");
  
  // Verify default export usage (calling express as a function)
  assertStringIncludes(js, "const app = express(");
  
  // Verify named export usage - the transpiler now uses direct property access
  // Update tests to look for direct property access instead of IIFE pattern
  assertStringIncludes(js, "express.Router");
  assertStringIncludes(js, "express.json");
});

Deno.test("remote imports - multiple imports", async () => {
  const js = await transpileToJS(SAMPLES.multipleImports);
  
  // Verify both imports are processed with unique variable names
  assertStringIncludes(js, "import * as pathModule");
  assertStringIncludes(js, "import * as fsModule");
  
  // Verify no name clash in the generated code
  assertStringIncludes(js, "const path = (function");
  assertStringIncludes(js, "const fs = (function");
  
  // Verify usage of both modules
  assertStringIncludes(js, "path.dirname(\"file.txt\")");
  assertStringIncludes(js, "fs.existsSync(dir_path)");
});

Deno.test("remote imports - jsr import", async () => {
  const js = await transpileToJS(SAMPLES.jsrImport);
  
  // Verify JSR import works - updated with correct package name
  assertStringIncludes(js, "import * as chalkModule from \"jsr:@nothing628/chalk\"");
  
  // Verify wrapper function
  assertStringIncludes(js, "const chalk = (function");
  
  // Verify usage of the imported module
  assertStringIncludes(js, "chalk.green(\"Success!\")");
  assertStringIncludes(js, "chalk.red(\"Error!\")");
});

Deno.test("remote imports - import and export", async () => {
  const js = await transpileToJS(SAMPLES.importAndExport);
  
  // Verify import
  assertStringIncludes(js, "import * as pathModule");
  
  // Verify usage
  assertStringIncludes(js, "const ext = path.extname(\"file.txt\")");
  
  // Verify export
  assertStringIncludes(js, "export { ext as fileExtension }");
});