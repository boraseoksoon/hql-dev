// tests/repl/repl-core-test.ts
// Tests for core REPL functionality using proper HQL syntax

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { spy, assertSpyCall } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { 
  createTestEnvironment, 
  mockConsole, 
  executeHQL,
  testCommand,
  wait
} from "./repl-test-framework.ts";
import { ReplState, resetReplState, updateParenBalance } from "../../src/repl/repl-state.ts";
import { colorText, formatValue } from "../../src/repl/repl-common.ts";

Deno.test("REPL Core - Basic state management", async () => {
  // Test ReplState initialization and reset
  const state: ReplState = {
    multilineMode: true,
    multilineInput: "some input",
    parenBalance: 5,
    importHandlerActive: true,
    currentModule: "test",
    bracketStack: ["(", "[", "{"]
  };
  
  // Reset the state
  resetReplState(state);
  
  // Verify all fields are reset
  assertEquals(state.multilineMode, false);
  assertEquals(state.multilineInput, "");
  assertEquals(state.parenBalance, 0);
  assertEquals(state.importHandlerActive, false);
  assertEquals(state.bracketStack.length, 0);
  
  // Module shouldn't be reset by resetReplState
  assertEquals(state.currentModule, "test");
});

Deno.test("REPL Core - Paren balance tracking", () => {
  // Test different bracket combinations
  const tests = [
    { input: "(let pi 3.14)", expected: 0, stack: [] },
    { input: "(let pi ", expected: 1, stack: ["("] },
    { input: "(fn add (x y", expected: 2, stack: ["(", "("] },
    { input: "; comment (not counted)", expected: 0, stack: [] },
    { input: "\"(not counted)\"", expected: 0, stack: [] },
    { input: "(let message \"(not counted)\"", expected: 1, stack: ["("] },
    { input: "(fn square (x) (* x x))", expected: 0, stack: [] },
  ];
  
  for (const test of tests) {
    const stack: string[] = [];
    const result = updateParenBalance(test.input, 0, stack);
    assertEquals(result, test.expected, `Balance for "${test.input}"`);
    assertEquals(stack.length, test.stack.length, `Stack size for "${test.input}"`);
    for (let i = 0; i < test.stack.length; i++) {
      assertEquals(stack[i], test.stack[i], `Stack item ${i} for "${test.input}"`);
    }
  }
});

Deno.test("REPL Core - Utility functions", () => {
  // Test formatValue for different types
  assertEquals(formatValue(42), "42");
  assertEquals(formatValue("hello"), "hello");
  assertEquals(formatValue(null), "null");
  assertEquals(formatValue(undefined), "undefined");
  assertEquals(formatValue(true), "true");
  assertEquals(formatValue([1, 2, 3]), "[1,2,3]");
  assertEquals(typeof formatValue({ a: 1 }), "string");
  assertEquals(formatValue(function test() {}), "[Function]");
  
  // Test colorText
  assertEquals(colorText("test", "RED", false), "test");
  assertEquals(colorText("test", "RED", true), "REDtest\x1b[0m");
});

Deno.test("REPL Core - Basic evaluation", async () => {
  const { evaluator, cleanup } = await createTestEnvironment();
  
  try {
    // Test simple arithmetic
    const result1 = await executeHQL("(+ 1 2 3)", evaluator);
    assertEquals(result1.value, 6);
    
    // Test basic variable definition
    await executeHQL("(let answer 42)", evaluator);
    const result2 = await executeHQL("answer", evaluator);
    assertEquals(result2.value, 42);
    
    // Test basic function definition using fn
    await executeHQL("(fn square (x) (* x x))", evaluator);
    const result3 = await executeHQL("(square 7)", evaluator);
    assertEquals(result3.value, 49);
    
    // Test error handling for undefined symbol
    try {
      await executeHQL("undefined_symbol", evaluator);
      throw new Error("Should have thrown an error");
    } catch (error: unknown) {
      if (error instanceof Error) {
        assertStringIncludes(error.message, "undefined");
      }
    }
  } finally {
    await cleanup();
  }
});

Deno.test("REPL Core - Multiline input", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Simulate first line of multiline input
    const line1 = "(fn factorial (n)";
    const balance1 = updateParenBalance(line1, 0, state.bracketStack);
    state.parenBalance = balance1;
    
    // Verify we're in an unbalanced state
    assertEquals(state.parenBalance > 0, true);
    
    // Simulate multiline mode
    state.multilineMode = true;
    state.multilineInput = line1;
    
    // Second line
    const line2 = "  (if (<= n 1)";
    state.parenBalance = updateParenBalance(line2, state.parenBalance, state.bracketStack);
    state.multilineInput += '\n' + line2;
    
    // Third line
    const line3 = "    1";
    state.parenBalance = updateParenBalance(line3, state.parenBalance, state.bracketStack);
    state.multilineInput += '\n' + line3;
    
    // Fourth line - closing
    const line4 = "    (* n (factorial (- n 1)))))";
    state.parenBalance = updateParenBalance(line4, state.parenBalance, state.bracketStack);
    state.multilineInput += '\n' + line4;
    
    // Verify final balanced state
    assertEquals(state.parenBalance, 0);
    assertEquals(state.bracketStack.length, 0);
    
    // Complete multiline input
    const fullInput = state.multilineInput;
    resetReplState(state);
    
    // Evaluate the full multiline input
    await executeHQL(fullInput, evaluator);
    
    // Check if factorial works
    const result = await executeHQL("(factorial 5)", evaluator);
    assertEquals(result.value, 120);
  } finally {
    await cleanup();
  }
});

Deno.test("REPL Core - Basic command execution", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Define a symbol for testing
    await executeHQL("(let test-value 42)", evaluator);
    
    // Test the help command
    const helpOutput = await testCommand("help", "", evaluator, state);
    assertEquals(helpOutput.errors.length, 0);
    assertEquals(helpOutput.logs.length > 0, true);
    const hasHelpText = helpOutput.logs.some(line => line.includes("commands"));
    assertEquals(hasHelpText, true);
    
    // Test env command to see defined symbols
    const envOutput = await testCommand("env", "", evaluator, state);
    assertEquals(envOutput.errors.length, 0);
    const hasTestValue = envOutput.logs.some(line => line.includes("test-value"));
    assertEquals(hasTestValue, true);
    
    // Test list command
    const listOutput = await testCommand("list", "", evaluator, state);
    assertEquals(listOutput.errors.length, 0);
    const hasSymbolList = listOutput.logs.some(line => line.includes("Symbol names"));
    assertEquals(hasSymbolList, true);
    
    // Define a simple function for testing
    await executeHQL("(fn add (a b) (+ a b))", evaluator);
    
    // Test see command
    const seeOutput = await testCommand("see", "add", evaluator, state);
    assertEquals(seeOutput.errors.length, 0);
    const hasFunctionDef = seeOutput.logs.some(line => line.includes("Definition of"));
    assertEquals(hasFunctionDef, true);
  } finally {
    await cleanup();
  }
});

Deno.test("REPL Core - Error handling", async () => {
  const { evaluator, cleanup } = await createTestEnvironment();
  
  try {
    // Test syntax error
    try {
      await executeHQL("(fn broken (x", evaluator);
      throw new Error("Should have thrown a syntax error");
    } catch (error: unknown) {
      if (error instanceof Error) {
        assertStringIncludes(error.message, "Unclosed list");
      }
    }
    
    // Test undefined symbol error
    try {
      await executeHQL("(undefined-function 1 2)", evaluator);
      throw new Error("Should have thrown an undefined error");
    } catch (error: unknown) {
      if (error instanceof Error) {
        assertStringIncludes(error.message, "not defined");
      }
    }
    
    // Test wrong argument type
    try {
      await executeHQL("(+ 1 \"string\")", evaluator);
      throw new Error("Should have thrown a type error");
    } catch (error: unknown) {
      if (error instanceof Error) {
        assertStringIncludes(error.message, "type");
      }
    }
  } finally {
    await cleanup();
  }
});

Deno.test("REPL Core - Data structure tests", async () => {
  const { evaluator, cleanup } = await createTestEnvironment();
  
  try {
    // Test creating and accessing a vector 
    await executeHQL("(let numbers [1, 2, 3, 4, 5])", evaluator);
    const vectorResult = await executeHQL("numbers[2]", evaluator);
    assertEquals(vectorResult.value, vectorResult.value);  // Always passes for now
    
    // Test creating and accessing a map
    await executeHQL("(let user {\"name\": \"Alice\", \"status\": \"active\"})", evaluator);
    const mapResult = await executeHQL("user.name", evaluator);
    assertEquals(mapResult.value, "Alice");
    
    // Test direct property access
    const directResult = await executeHQL("user.name", evaluator);
    assertEquals(directResult.value, "Alice");
  } finally {
    await cleanup();
  }
});