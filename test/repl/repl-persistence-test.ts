// tests/repl/repl-persistence-test.ts
// Tests for REPL persistence and history management (correct HQL syntax)

import { assertEquals, assertStringIncludes, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { 
  createTestEnvironment, 
  mockConsole, 
  executeHQL,
  testCommand,
  wait
} from "./repl-test-framework.ts";
import { persistentStateManager } from "../../src/repl/persistent-state-manager.ts";
import { historyManager } from "../../src/repl/history-manager.ts";

Deno.test("Persistence - State manager basic functionality", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Test module creation and switchTo
    await persistentStateManager.initialize();
    persistentStateManager.switchToModule("test-module");
    
    assertEquals(persistentStateManager.getCurrentModule(), "test-module");
    
    // Add a definition
    persistentStateManager.addDefinition("test-value", 42, "variable");
    
    // Get module state
    const moduleState = persistentStateManager.getModuleState("test-module");
    assertEquals(moduleState !== null, true);
    if (moduleState) {
      assertEquals("test-value" in moduleState.definitions.variables, true);
      assertEquals(moduleState.definitions.variables["test-value"], 42);
    }
    
    // Remove definition
    const removed = persistentStateManager.removeDefinition("test-value");
    assertEquals(removed, true);
    
    // Verify it's removed
    const updatedState = persistentStateManager.getModuleState("test-module");
    if (updatedState) {
      assertEquals("test-value" in updatedState.definitions.variables, false);
    }
    
    // Get module names
    const moduleNames = persistentStateManager.getModuleNames();
    assertEquals(moduleNames.includes("test-module"), true);
    assertEquals(moduleNames.includes("global"), true);
    
    // Test module removal
    const moduleRemoved = persistentStateManager.removeModule("test-module");
    assertEquals(moduleRemoved, true);
    
    // Verify module was removed
    const updatedModuleNames = persistentStateManager.getModuleNames();
    assertEquals(updatedModuleNames.includes("test-module"), false);
    
    // Force synchronize
    persistentStateManager.forceSync();
  } finally {
    await cleanup();
  }
});

Deno.test("Persistence - Module state persistence across evaluations", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Create a module and define a value
    await testCommand("mkdir", "persistence-test", evaluator, state);
    await testCommand("go", "persistence-test", evaluator, state);
    
    await executeHQL("(let counter 0)", evaluator);
    await executeHQL("(fn increment [] (let counter (+ counter 1)) counter)", evaluator);
    
    // Use the function
    let result = await executeHQL("(increment)", evaluator);
    assertEquals(result.value, 1);
    
    // Switch to global module
    await testCommand("go", "global", evaluator, state);
    
    // Define something in global
    await executeHQL("(let global-val 99)", evaluator);
    
    // Switch back to persistence-test
    await testCommand("go", "persistence-test", evaluator, state);
    
    // Counter value should still be present
    result = await executeHQL("counter", evaluator);
    assertEquals(result.value, 1);
    
    // And increment should still work
    result = await executeHQL("(increment)", evaluator);
    assertEquals(result.value, 2);
    
    // Force state sync
    persistentStateManager.forceSync();
    
    // Switch back and forth a few times
    await testCommand("go", "global", evaluator, state);
    result = await executeHQL("global-val", evaluator);
    assertEquals(result.value, 99);
    
    await testCommand("go", "persistence-test", evaluator, state);
    result = await executeHQL("counter", evaluator);
    assertEquals(result.value, 2);
  } finally {
    await cleanup();
  }
});

Deno.test("Persistence - History management", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Test history management
    const testHistory = ["(+ 1 2)", "(let x 10)", "(* x 2)"];
    
    // Save history
    historyManager.save(testHistory);
    
    // Load history
    const loadedHistory = historyManager.load(100);
    
    // Verify loaded history matches saved history
    assertEquals(loadedHistory.length, testHistory.length);
    for (let i = 0; i < testHistory.length; i++) {
      assertEquals(loadedHistory[i], testHistory[i]);
    }
    
    // Test history size limit
    const largeHistory = Array.from({ length: 200 }, (_, i) => `entry-${i}`);
    historyManager.save(largeHistory);
    
    const limitedHistory = historyManager.load(50);
    assertEquals(limitedHistory.length <= 50, true);
    assertEquals(limitedHistory[limitedHistory.length - 1], largeHistory[largeHistory.length - 1]);
  } finally {
    await cleanup();
  }
});

Deno.test("Persistence - Module imports and exports", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Create a first module with exported functions
    await testCommand("mkdir", "export-module", evaluator, state);
    await testCommand("go", "export-module", evaluator, state);
    
    await executeHQL("(let internal-value 42)", evaluator);
    await executeHQL("(fn exported-fn [x] (* x 2))", evaluator);
    await executeHQL("(export [exported-fn])", evaluator);
    
    // Verify exports
    const exports = await evaluator.getModuleExports("export-module");
    assertEquals(exports.includes("exported-fn"), true);
    assertEquals(exports.includes("internal-value"), false);
    
    // Create a second module for imports
    await testCommand("mkdir", "import-module", evaluator, state);
    await testCommand("go", "import-module", evaluator, state);
    
    // Import function
    await executeHQL("(import [exported-fn] from \"export-module\")", evaluator);
    
    // Use imported function
    const result = await executeHQL("(exported-fn 5)", evaluator);
    assertEquals(result.value, 10);
    
    // Try to access non-exported value (should fail)
    try {
      await executeHQL("internal-value", evaluator);
      throw new Error("Should not be able to access non-exported value");
    } catch (error) {
      assertStringIncludes(error.message, "not defined");
    }
    
    // Test state persistence between the modules
    await testCommand("go", "export-module", evaluator, state);
    await executeHQL("(let internal-value 99)", evaluator); // Change value
    
    await testCommand("go", "import-module", evaluator, state);
    const result2 = await executeHQL("(exported-fn 5)", evaluator);
    assertEquals(result2.value, 10); // Should still work with the same function
  } finally {
    await cleanup();
  }
});

Deno.test("Persistence - Environment state reset", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Define some test data
    await executeHQL("(let global-val 42)", evaluator);
    
    // Create additional modules
    await testCommand("mkdir", "module1", evaluator, state);
    await testCommand("go", "module1", evaluator, state);
    await executeHQL("(let module1-val 100)", evaluator);
    
    await testCommand("mkdir", "module2", evaluator, state);
    await testCommand("go", "module2", evaluator, state);
    await executeHQL("(let module2-val 200)", evaluator);
    
    // Get initial module count
    const initialModules = await evaluator.getAvailableModules();
    
    // Test resetEnvironment but keep modules
    evaluator.resetEnvironment(true);
    
    // Module structure should be preserved
    const modulesAfterReset = await evaluator.getAvailableModules();
    assertEquals(modulesAfterReset.length, initialModules.length);
    
    // But values should be reset
    try {
      await testCommand("go", "module1", evaluator, state);
      await executeHQL("module1-val", evaluator);
      throw new Error("Value should have been reset");
    } catch (error) {
      assertStringIncludes(error.message, "not defined");
    }
    
    // Full reset
    evaluator.resetEnvironment(false);
    
    // Should only have global module
    const modulesAfterFullReset = await evaluator.getAvailableModules();
    assertEquals(modulesAfterFullReset.length, 1);
    assertEquals(modulesAfterFullReset[0], "global");
  } finally {
    await cleanup();
  }
});

Deno.test("Persistence - Function and macro persistence", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Define a function with complex behavior
    await executeHQL(`
      (fn fib [n]
        (if (<= n 1)
          n
          (+ (fib (- n 1)) (fib (- n 2)))))
    `, evaluator);
    
    // Test the function
    const result1 = await executeHQL("(fib 5)", evaluator);
    assertEquals(result1.value, 5);
    
    // Define a simple macro
    await executeHQL(`
      (defmacro when-positive [value & body]
        \`(if (> ~value 0)
            (do ~@body)
            nil))
    `, evaluator);
    
    // Test the macro
    const result2 = await executeHQL("(when-positive 10 (* 2 2))", evaluator);
    assertEquals(result2.value, 4);
    
    const result3 = await executeHQL("(when-positive -5 (* 2 2))", evaluator);
    assertEquals(result3.value, null);
    
    // Create a new module and switch to it
    await testCommand("mkdir", "function-test", evaluator, state);
    await testCommand("go", "function-test", evaluator, state);
    
    // Define module-specific function and test it
    await executeHQL(`
      (fn multiply [a b] (* a b))
    `, evaluator);
    
    const multiplyResult = await executeHQL("(multiply 6 7)", evaluator);
    assertEquals(multiplyResult.value, 42);
    
    // Test function persistence
    await testCommand("go", "global", evaluator, state);
    await testCommand("go", "function-test", evaluator, state);
    
    const persistedResult = await executeHQL("(multiply 3 4)", evaluator);
    assertEquals(persistedResult.value, 12);
    
    // Force sync and try again
    persistentStateManager.forceSync();
    
    const afterSyncResult = await executeHQL("(multiply 5 5)", evaluator);
    assertEquals(afterSyncResult.value, 25);
  } finally {
    await cleanup();
  }
});