// tests/repl/repl-module-test.ts
// Tests for REPL module system functionality with correct HQL syntax

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  createTestEnvironment, 
  mockConsole, 
  executeHQL,
  testCommand,
  verifyModuleContainsSymbols,
  wait
} from "./repl-test-framework.ts";

Deno.test("Module System - Basic module creation and switching", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Default module should be "global"
    assertEquals(state.currentModule, "global");
    
    // Create a new module
    const mkdirOutput = await testCommand("mkdir", "test-module", evaluator, state);
    assertEquals(mkdirOutput.errors.length, 0);
    
    // Lists all available modules
    const modulesOutput = await testCommand("modules", "", evaluator, state);
    assertEquals(modulesOutput.errors.length, 0);
    const hasTestModule = modulesOutput.logs.some(line => line.includes("test-module"));
    assertEquals(hasTestModule, true);
    
    // Switch to the new module
    await testCommand("go", "test-module", evaluator, state);
    assertEquals(state.currentModule, "test-module");
    
    // Define something in the new module
    await executeHQL("(let test-value 123)", evaluator);
    
    // Should be visible only in this module
    const listOutput = await testCommand("list", "", evaluator, state);
    assertEquals(listOutput.errors.length, 0);
    const hasTestValue = listOutput.logs.some(line => line.includes("test-value"));
    assertEquals(hasTestValue, true);
    
    // Switch back to global
    await testCommand("go", "global", evaluator, state);
    assertEquals(state.currentModule, "global");
    
    // The test-value should not be visible in global
    const globalListOutput = await testCommand("list", "", evaluator, state);
    const hasTestValueInGlobal = globalListOutput.logs.some(line => line.includes("test-value"));
    assertEquals(hasTestValueInGlobal, false);
  } finally {
    await cleanup();
  }
});

Deno.test("Module System - Module imports and exports", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Create a math module with some functions
    await testCommand("mkdir", "math", evaluator, state);
    await testCommand("go", "math", evaluator, state);
    
    // Define and export functions
    await executeHQL("(fn square (x) (* x x))", evaluator);
    await executeHQL("(fn cube (x) (* x x x))", evaluator);
    await executeHQL("(export [square cube])", evaluator);
    
    // Create a utils module
    await testCommand("mkdir", "utils", evaluator, state);
    await testCommand("go", "utils", evaluator, state);
    
    // Define and export functions
    await executeHQL("(fn double (x) (+ x x))", evaluator);
    await executeHQL("(export [double])", evaluator);
    
    // Create a main module
    await testCommand("mkdir", "main", evaluator, state);
    await testCommand("go", "main", evaluator, state);
    
    // Import from math and utils
    await executeHQL(`(import [square] from "math")`, evaluator);
    await executeHQL(`(import [double] from "utils")`, evaluator);
    
    // Use the imported functions
    const result1 = await executeHQL("(square 4)", evaluator);
    assertEquals(result1.value, 16);
    
    const result2 = await executeHQL("(double 5)", evaluator);
    assertEquals(result2.value, 10);
    
    // Trying to use a non-imported function should fail
    try {
      await executeHQL("(cube 3)", evaluator);
      throw new Error("Should have thrown an error for non-imported function");
    } catch (error) {
      assertStringIncludes(error.message, "not defined");
    }
    
    // Test see exports command
    const seeExportsOutput = await testCommand("see", "math:exports", evaluator, state);
    assertEquals(seeExportsOutput.errors.length, 0);
    const hasExports = seeExportsOutput.logs.some(line => 
      line.includes("square") && line.includes("cube")
    );
    assertEquals(hasExports, true);
  } finally {
    await cleanup();
  }
});

Deno.test("Module System - HQL native import/export syntax", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Create modules using (module ...) syntax
    await executeHQL("(module data)", evaluator);
    await executeHQL("(let items [1, 2, 3, 4, 5])", evaluator);
    await executeHQL("(let config {:debug true, :verbose false})", evaluator);
    await executeHQL("(export [items config])", evaluator);
    
    // Switch to a different module
    await executeHQL("(module app)", evaluator);
    
    // Import using HQL syntax
    await executeHQL("(import [items] from \"data\")", evaluator);
    
    // Verify the import worked
    const result = await executeHQL("items", evaluator);
    assertEquals(Array.isArray(result.value), true);
    assertEquals(result.value.length, 5);
    
    // Try to import multiple symbols
    await executeHQL("(import [config] from \"data\")", evaluator);
    
    // Access imported object properties
    const debugResult = await executeHQL("(get config :debug)", evaluator);
    assertEquals(debugResult.value, true);
    
    // Create a function that uses imported values
    await executeHQL("(fn process () (map (lambda (x) (* x 2)) items))", evaluator);
    
    // Test the function
    const processResult = await executeHQL("(process)", evaluator);
    assertEquals(Array.isArray(processResult.value), true);
    assertEquals(processResult.value.length, 5);
    assertEquals(processResult.value[0], 2);
    assertEquals(processResult.value[4], 10);
  } finally {
    await cleanup();
  }
});

Deno.test("Module System - Module persistence and state", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Create a persistent module
    await testCommand("mkdir", "persistent", evaluator, state);
    await testCommand("go", "persistent", evaluator, state);
    
    // Define symbols
    await executeHQL("(let counter 0)", evaluator);
    await executeHQL("(fn increment [] (let counter (+ counter 1)) counter)", evaluator);
    
    // Use the counter
    const result1 = await executeHQL("(increment)", evaluator);
    assertEquals(result1.value, 1);
    
    // Switch to a different module
    await testCommand("go", "global", evaluator, state);
    
    // Switch back to persistent
    await testCommand("go", "persistent", evaluator, state);
    
    // Counter should be preserved
    const result2 = await executeHQL("counter", evaluator);
    assertEquals(result2.value, 1);
    
    // Increment again
    const result3 = await executeHQL("(increment)", evaluator);
    assertEquals(result3.value, 2);
    
    // Remove a symbol and test
    const removeOutput = await testCommand("remove", "counter", evaluator, state);
    assertEquals(removeOutput.errors.length, 0);
    
    // Testing that symbol was removed
    try {
      await executeHQL("counter", evaluator);
      throw new Error("Symbol should have been removed");
    } catch (error) {
      assertStringIncludes(error.message, "not defined");
    }
    
    // Increment function should also break
    try {
      await executeHQL("(increment)", evaluator);
      throw new Error("Should have thrown an error for function using removed symbol");
    } catch (error) {
      assertStringIncludes(error.message, "not defined");
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Module System - Module removal", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Create temporary modules
    await testCommand("mkdir", "temp1", evaluator, state);
    await testCommand("mkdir", "temp2", evaluator, state);
    await testCommand("mkdir", "temp3", evaluator, state);
    
    // Switch to temp2 and define symbols
    await testCommand("go", "temp2", evaluator, state);
    await executeHQL("(let value 42)", evaluator);
    
    // Switch to global
    await testCommand("go", "global", evaluator, state);
    
    // Remove temp2 module
    const removeOutput = await testCommand("remove", "temp2", evaluator, state);
    assertEquals(removeOutput.errors.length, 0);
    
    // List modules to verify removal
    const modulesOutput = await testCommand("modules", "", evaluator, state);
    assertEquals(modulesOutput.errors.length, 0);
    const hasTemp2 = modulesOutput.logs.some(line => line.includes("temp2"));
    assertEquals(hasTemp2, false);
    
    // Verify we can't switch to removed module
    const goOutput = await testCommand("go", "temp2", evaluator, state);
    assertEquals(goOutput.errors.length > 0, true);
    
    // Remove a module we're currently in
    await testCommand("go", "temp3", evaluator, state);
    const removeSelfOutput = await testCommand("remove", "temp3", evaluator, state);
    assertEquals(removeSelfOutput.errors.length, 0);
    
    // Should be automatically switched to a valid module
    assertStringIncludes(state.currentModule, "global");
  } finally {
    await cleanup();
  }
});

Deno.test("Module System - Cross-module symbol resolution", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Create modules
    await testCommand("mkdir", "core", evaluator, state);
    await testCommand("go", "core", evaluator, state);
    
    // Define and export in core
    await executeHQL("(let base-value 100)", evaluator);
    await executeHQL("(fn get-base [] base-value)", evaluator);
    await executeHQL("(fn set-base [v] (let base-value v))", evaluator);
    await executeHQL("(export [get-base set-base])", evaluator);
    
    // Create extension module
    await testCommand("mkdir", "extension", evaluator, state);
    await testCommand("go", "extension", evaluator, state);
    
    // Import from core
    await executeHQL("(import [get-base set-base] from \"core\")", evaluator);
    
    // Use imported functions
    const result1 = await executeHQL("(get-base)", evaluator);
    assertEquals(result1.value, 100);
    
    // Modify state in another module
    await executeHQL("(set-base 200)", evaluator);
    
    // Verify change propagated
    const result2 = await executeHQL("(get-base)", evaluator);
    assertEquals(result2.value, 200);
    
    // Switch to core to verify
    await testCommand("go", "core", evaluator, state);
    const result3 = await executeHQL("base-value", evaluator);
    assertEquals(result3.value, 200);
    
    // Test cross-module symbol references with :see command
    await testCommand("go", "extension", evaluator, state);
    const seeOutput = await testCommand("see", "core:base-value", evaluator, state);
    assertEquals(seeOutput.errors.length, 0);
    const hasValueInfo = seeOutput.logs.some(line => line.includes("200"));
    assertEquals(hasValueInfo, true);
  } finally {
    await cleanup();
  }
});

Deno.test("Module System - Find command across modules", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Create various modules with test patterns
    await testCommand("mkdir", "strings", evaluator, state);
    await testCommand("go", "strings", evaluator, state);
    await executeHQL("(fn concat-str [a b] (str a b))", evaluator);
    await executeHQL("(fn upper-case [s] (to-upper-case s))", evaluator);
    
    await testCommand("mkdir", "numbers", evaluator, state);
    await testCommand("go", "numbers", evaluator, state);
    await executeHQL("(fn add-nums [a b] (+ a b))", evaluator);
    await executeHQL("(fn mult-nums [a b] (* a b))", evaluator);
    
    await testCommand("mkdir", "string-utils", evaluator, state);
    await testCommand("go", "string-utils", evaluator, state);
    await executeHQL("(fn trim-str [s] (trim s))", evaluator);
    
    // Test find for 'str' pattern (should match modules and symbols)
    const findStrOutput = await testCommand("find", "str", evaluator, state);
    assertEquals(findStrOutput.errors.length, 0);
    
    // Should find modules
    const foundStringsModule = findStrOutput.logs.some(line => 
      line.includes("strings") && !line.includes("string-utils")
    );
    const foundStringUtilsModule = findStrOutput.logs.some(line => 
      line.includes("string-utils")
    );
    assertEquals(foundStringsModule, true);
    assertEquals(foundStringUtilsModule, true);
    
    // Should find symbols
    const foundConcatStr = findStrOutput.logs.some(line => line.includes("concat-str"));
    const foundTrimStr = findStrOutput.logs.some(line => line.includes("trim-str"));
    assertEquals(foundConcatStr, true);
    assertEquals(foundTrimStr, true);
    
    // Test find for 'nums' pattern
    const findNumsOutput = await testCommand("find", "nums", evaluator, state);
    assertEquals(findNumsOutput.errors.length, 0);
    const foundAddNums = findNumsOutput.logs.some(line => line.includes("add-nums"));
    const foundMultNums = findNumsOutput.logs.some(line => line.includes("mult-nums"));
    assertEquals(foundAddNums, true);
    assertEquals(foundMultNums, true);
    
    // Test find for non-existent pattern
    const findNothingOutput = await testCommand("find", "nonexistent", evaluator, state);
    assertEquals(findNothingOutput.errors.length, 0);
    const noMatches = findNothingOutput.logs.some(line => line.includes("No matches found"));
    assertEquals(noMatches, true);
  } finally {
    await cleanup();
  }
});