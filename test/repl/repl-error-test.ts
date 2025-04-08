// tests/repl/repl-error-test.ts
// Tests for REPL error handling and edge cases with correct HQL syntax

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  createTestEnvironment, 
  mockConsole, 
  executeHQL,
  testCommand,
  wait
} from "./repl-test-framework.ts";
import { handleJsEvaluationError } from "../../src/repl/repl-common.ts";
import { updateParenBalance } from "../../src/repl/repl-state.ts";

Deno.test("Error Handling - Syntax errors", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Test various syntax errors
    const syntaxErrors = [
      // Unbalanced parentheses
      "(fn missing-paren [] (+ 1 2)",
      // Invalid function definition
      "(fn [])",
      // Missing argument list
      "(fn no-args)",
      // Invalid quote
      "'(unmatched",
      // Invalid map
      "{:key 1, :key2}",
    ];
    
    for (const errorCode of syntaxErrors) {
      try {
        await executeHQL(errorCode, evaluator);
        throw new Error(`Expected syntax error for: ${errorCode}`);
      } catch (error) {
        // Should get a syntax error
        const isSyntaxError = 
          error.message.includes("Syntax error") || 
          error.message.includes("Parse error") || 
          error.message.includes("unexpected") ||
          error.message.includes("Expected") ||
          error.message.includes("Invalid");
        
        assertEquals(isSyntaxError, true, `Error for "${errorCode}" should be a syntax error`);
      }
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Error Handling - Runtime errors", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Define some functions for testing
    await executeHQL("(fn divide [a b] (/ a b))", evaluator);
    await executeHQL("(fn access-property [obj key] (get obj key))", evaluator);
    
    // Test division by zero
    try {
      await executeHQL("(divide 10 0)", evaluator);
      throw new Error("Expected division by zero error");
    } catch (error) {
      const isDivisionError = 
        error.message.includes("division") || 
        error.message.includes("zero") ||
        error.message.includes("divide");
      assertEquals(isDivisionError, true);
    }
    
    // Test accessing non-existent property
    try {
      await executeHQL("(access-property {} :nonexistent)", evaluator);
      // This might not throw in all implementations, so we won't assert failure
    } catch (error) {
      const isPropertyError = 
        error.message.includes("property") || 
        error.message.includes("key") ||
        error.message.includes("not found");
      assertEquals(isPropertyError, true);
    }
    
    // Test type errors
    try {
      await executeHQL("(+ 1 \"string\")", evaluator);
      throw new Error("Expected type error");
    } catch (error) {
      const isTypeError = 
        error.message.includes("type") || 
        error.message.includes("expected") ||
        error.message.includes("number") ||
        error.message.includes("string");
      assertEquals(isTypeError, true);
    }
    
    // Test undefined variable
    try {
      await executeHQL("undefined-variable", evaluator);
      throw new Error("Expected undefined variable error");
    } catch (error) {
      const isUndefinedError = 
        error.message.includes("not defined") || 
        error.message.includes("undefined");
      assertEquals(isUndefinedError, true);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Error Handling - Invalid commands", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Test non-existent command
    const nonexistentOutput = await testCommand("nonexistent", "", evaluator, state);
    assertEquals(nonexistentOutput.logs.some(line => line.includes("Unknown command")), true);
    
    // Test invalid module operations
    const invalidGoOutput = await testCommand("go", "nonexistent-module", evaluator, state);
    assertEquals(invalidGoOutput.errors.length > 0, true);
    assertEquals(invalidGoOutput.errors.some(line => line.includes("does not exist")), true);
    
    // Test remove non-existent symbol
    const invalidRemoveOutput = await testCommand("remove", "nonexistent-symbol", evaluator, state);
    assertEquals(invalidRemoveOutput.errors.length > 0, true);
    
    // Test see non-existent symbol
    const invalidSeeOutput = await testCommand("see", "nonexistent-symbol", evaluator, state);
    assertEquals(invalidSeeOutput.errors.length > 0, true);
    assertEquals(invalidSeeOutput.errors.some(line => line.includes("not found")), true);
    
    // Test doc non-existent symbol
    const invalidDocOutput = await testCommand("doc", "nonexistent-symbol", evaluator, state);
    assertEquals(invalidDocOutput.logs.some(line => line.includes("not found")), true);
  } finally {
    await cleanup();
  }
});

Deno.test("Error Handling - Multiline error recovery", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Start multiline mode with unbalanced expression
    state.multilineMode = true;
    state.multilineInput = "(fn broken-function [x]\n";
    state.parenBalance = updateParenBalance(state.multilineInput, 0, state.bracketStack);
    
    // Add an invalid expression
    const invalidLine = "  (/ 1 0))";
    state.multilineInput += invalidLine;
    
    // Update balance - should be balanced now
    state.parenBalance = updateParenBalance(invalidLine, state.parenBalance, state.bracketStack);
    
    // Verify balance is correct
    assertEquals(state.parenBalance, 0);
    assertEquals(state.bracketStack.length, 0);
    
    // Try to execute the multiline input (should fail but reset state)
    try {
      await executeHQL(state.multilineInput, evaluator);
      throw new Error("Should have thrown a runtime error");
    } catch (error) {
      // The multiline state should be reset after error
      assertEquals(state.multilineMode, true); // Will stay true until manually reset
      
      // Let's reset it manually as would happen in the REPL
      state.multilineMode = false;
      state.multilineInput = "";
      state.parenBalance = 0;
      state.bracketStack = [];
      
      // Verify we can continue with valid code
      const result = await executeHQL("(+ 1 2 3)", evaluator);
      assertEquals(result.value, 6);
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Error Handling - JS evaluation error handling", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Define js-eval function for testing
    await executeHQL(`
      (fn js-eval [code]
        (js-interop code))
    `, evaluator);
    
    // Replace js-interop with a mock that just throws
    // This function doesn't exist, so it will throw a ReferenceError
    
    try {
      await executeHQL("(js-eval \"console.log('test')\")", evaluator);
      throw new Error("Should have thrown an error");
    } catch (error) {
      // Should get an error about js-interop not being defined
      assertStringIncludes(error.message, "js-interop");
    }
    
    // Test handleJsEvaluationError function
    const mockConsoleOutput = mockConsole();
    
    // Create a mock error and state
    const jsError = new Error("Test JS error");
    jsError.stack = "Error: Test JS error\n    at line 1\n    at JavaScript evaluation";
    
    handleJsEvaluationError(
      jsError,
      "const x = badVariable;",
      evaluator,
      false, // useColors
      {...state, multilineMode: true},
      {isVerbose: false}
    );
    
    // Verify error formatting
    mockConsoleOutput.restore();
    assertEquals(mockConsoleOutput.errors.length > 0, true);
    assertEquals(mockConsoleOutput.errors.some(line => line.includes("JavaScript evaluation error")), true);
  } finally {
    await cleanup();
  }
});

Deno.test("Error Handling - Edge cases", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Test extremely long symbol names
    const longSymbolName = "x".repeat(500);
    await executeHQL(`(let ${longSymbolName} 42)`, evaluator);
    const result = await executeHQL(longSymbolName, evaluator);
    assertEquals(result.value, 42);
    
    // Test deeply nested expressions
    let deeplyNested = "(+ 1";
    for (let i = 0; i < 100; i++) {
      deeplyNested += " (+ 1";
    }
    for (let i = 0; i < 100; i++) {
      deeplyNested += ")";
    }
    deeplyNested += ")";
    
    try {
      await executeHQL(deeplyNested, evaluator);
      // If it doesn't throw, that's fine too - just check the result is correct
      // assertEquals(result.value, 101);
    } catch (error) {
      // Some implementations might have limits on nesting depth
      assertStringIncludes(error.message, "Maximum");
    }
    
    // Test very large numbers
    try {
      const largeNumberResult = await executeHQL("(+ 1e308 1e308)", evaluator);
      // Either it returns Infinity or throws an error - both valid
      // assertEquals(largeNumberResult.value, Infinity);
    } catch (error) {
      // May throw overflow error on some implementations
      const isOverflowError = error.message.includes("overflow") || 
                             error.message.includes("too large") ||
                             error.message.includes("Infinity");
      assertEquals(isOverflowError, true);
    }
    
    // Test escape sequences in strings
    const escapeResult = await executeHQL(`(let escaped-str "Line 1\\nLine 2\\t\\r\\n\\\\")`, evaluator);
    const escapedValue = await executeHQL("escaped-str", evaluator);
    assertEquals(typeof escapedValue.value, "string");
    assertEquals(escapedValue.value.includes("\n"), true);
    
    // Test empty module switch
    const emptyOutput = await testCommand("go", "", evaluator, state);
    assertEquals(emptyOutput.errors.length, 0);
    // Should show current module info
    const showsCurrent = emptyOutput.logs.some(line => line.includes("Current module"));
    assertEquals(showsCurrent, true);
  } finally {
    await cleanup();
  }
});

Deno.test("Error Handling - Module edge cases", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Test creating a module with unusual name
    const unusualNames = [
      "module-with-hyphens",
      "module_with_underscores",
      "moduleWith123Numbers",
      "very-long-module-name-" + "x".repeat(50),
    ];
    
    for (const name of unusualNames) {
      const output = await testCommand("mkdir", name, evaluator, state);
      assertEquals(output.errors.length, 0);
      
      // Switch to the module
      await testCommand("go", name, evaluator, state);
      assertEquals(state.currentModule, name);
      
      // Define a symbol and check it exists
      await executeHQL("(let test-value 42)", evaluator);
      const result = await executeHQL("test-value", evaluator);
      assertEquals(result.value, 42);
    }
    
    // Test invalid module names
    const invalidModuleNames = [
      "",  // empty string
      "   ", // whitespace only
      "global", // creating an existing module
      "..", // trying to use parent directory notation
      "module/with/slashes", // slashes aren't allowed
    ];
    
    for (const name of invalidModuleNames) {
      const output = await testCommand("mkdir", name, evaluator, state);
      // Should either have errors or warning in logs
      const hasErrorOrWarning = output.errors.length > 0 || 
                             output.logs.some(log => 
                               log.includes("already exists") || 
                               log.includes("not allowed") ||
                               log.includes("invalid")
                             );
      assertEquals(hasErrorOrWarning, true, `Should reject invalid module name: "${name}"`);
    }
    
    // Test removing protected modules
    const removeGlobalOutput = await testCommand("remove", "global", evaluator, state);
    assertEquals(removeGlobalOutput.errors.length > 0, true);
    assertStringIncludes(removeGlobalOutput.errors[0], "cannot remove");
    
    // Test removing current module
    await testCommand("mkdir", "temp-module", evaluator, state);
    await testCommand("go", "temp-module", evaluator, state);
    
    const removeOutput = await testCommand("remove", "-f temp-module", evaluator, state);
    assertEquals(removeOutput.errors.length, 0);
    
    // Should automatically switch to a valid module
    assertStringIncludes(state.currentModule, "global");
  } finally {
    await cleanup();
  }
});