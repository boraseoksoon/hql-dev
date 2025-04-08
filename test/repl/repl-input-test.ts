// tests/repl/repl-input-test.ts
// Tests for REPL input handling, tab completion, and readline functionality

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  createTestEnvironment, 
  mockConsole, 
  mockStdin,
  mockStdout,
  executeHQL,
  testCommand,
  wait
} from "./repl-test-framework.ts";
import { readLineWithArrowKeys } from "../../src/repl/repl-input.ts";
import { getCurrentWordAtCursor } from "../../src/repl/repl-common.ts";
import { createTabCompletion } from "../../src/repl/repl-completion.ts";
import { toInternalName, toUserFacingName } from "../../src/repl/repl-completion.ts";
import { ReplState, resetReplState, updateParenBalance } from "../../src/repl/repl-state.ts";
import { getPrompt } from "../../src/repl/repl-commands.ts";
import { historyManager } from "../../src/repl/history-manager.ts";

// Test cursor position utilities
Deno.test("Input Handling - Current word extraction", () => {
  // Test with different cursor positions
  const testCases = [
    { input: "hello world", pos: 3, expected: "hel" },
    { input: "hello world", pos: 7, expected: "wo" },
    { input: "(+ 1 2)", pos: 3, expected: "1" },
    { input: "(fn test [x]", pos: 5, expected: "te" },
    { input: "module:symbol", pos: 8, expected: "module:s" },
    { input: "  hello  ", pos: 4, expected: "hel" },
    { input: "(let x 10)", pos: 6, expected: "x" },
    { input: "", pos: 0, expected: "" },
  ];
  
  for (const { input, pos, expected } of testCases) {
    const word = getCurrentWordAtCursor(input, pos);
    assertEquals(word.includes(expected), true, `Input: "${input}", Position: ${pos}, Expected: "${expected}", Got: "${word}"`);
  }
});

// Test name conversion utilities used in tab completion
Deno.test("Input Handling - Symbol name conversion", () => {
  const testCases = [
    { internal: "test_var", userFacing: "test-var" },
    { internal: "calculate_sum", userFacing: "calculate-sum" },
    { internal: "no_conversion_needed", userFacing: "no-conversion-needed" },
    { internal: "multiple_under_scores", userFacing: "multiple-under-scores" },
    { internal: "already-hyphenated", userFacing: "already-hyphenated" },
    { internal: "_leading", userFacing: "-leading" },
    { internal: "trailing_", userFacing: "trailing-" },
  ];
  
  for (const { internal, userFacing } of testCases) {
    // Test internal to user-facing conversion
    assertEquals(toUserFacingName(internal), userFacing);
    
    // Test user-facing to internal conversion
    assertEquals(toInternalName(userFacing), internal);
    
    // Test round-trip conversion
    assertEquals(toInternalName(toUserFacingName(internal)), internal);
    assertEquals(toUserFacingName(toInternalName(userFacing)), userFacing);
  }
});

Deno.test("Input Handling - Tab completion initialization", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Set up test data
    await executeHQL(`
      (let test-value 42)
      (fn test-function [x] (* x 2))
    `, evaluator);
    
    // Initialize tab completion provider
    const tabCompletion = createTabCompletion(
      evaluator, 
      () => state.currentModule
    );
    
    // Test getting completions
    const completions = await tabCompletion.getCompletions("(test-", 6);
    
    // Should find the test symbols
    assertEquals(completions.some(c => c.includes("test-")), true);
    
    // Test module-specific completions
    await testCommand("mkdir", "completion-test", evaluator, state);
    await testCommand("go", "completion-test", evaluator, state);
    await executeHQL("(let module-var 100)", evaluator);
    
    // Get completions in the new module context
    const moduleCompletions = await tabCompletion.getCompletions("module-", 7);
    assertEquals(moduleCompletions.some(c => c.includes("module-")), true);
    
    // Go back to global and test module command completion
    await testCommand("go", "global", evaluator, state);
    
    // Test command context-aware completions (for instance :go command)
    const moduleNameCompletions = await tabCompletion.getCompletions(":go complet", 12);
    assertEquals(moduleNameCompletions.some(c => c.includes("completion-test")), true);
  } finally {
    await cleanup();
  }
});

// Test keyboard navigation through mock stdin/stdout
Deno.test("Input Handling - Basic readline functionality", async () => {
  // This is a basic test for the readline implementation
  // We're just testing that the function exists and takes the expected parameters
  // since fully testing terminal interactions would require complex mocking
  
  // Verify the function signature and basic structure
  assertEquals(typeof readLineWithArrowKeys, "function");
  
  // Check it returns a Promise (async function)
  const mockPrompt = "test> ";
  const mockHistory: string[] = [];
  const mockHistoryIndex = -1;
  const result = readLineWithArrowKeys(mockPrompt, mockHistory, mockHistoryIndex);
  assertEquals(result instanceof Promise, true);
});

Deno.test("Input Handling - History management", async () => {
  // Test history management functionality
  
  // Create test history
  const testHistory = [
    "(+ 1 2 3)",
    "(let x 42)",
    "(fn test [y] (* y 2))",
    "(test x)"
  ];
  
  // Save to history manager
  historyManager.save(testHistory);
  
  // Load history
  const loadedHistory = historyManager.load(100);
  
  // Verify all history items were loaded
  assertEquals(loadedHistory.length, testHistory.length);
  for (let i = 0; i < testHistory.length; i++) {
    assertEquals(loadedHistory[i], testHistory[i]);
  }
  
  // Test history size limiting
  const longHistory = Array.from({ length: 200 }, (_, i) => `item-${i}`);
  historyManager.save(longHistory);
  const limitedHistory = historyManager.load(50);
  assertEquals(limitedHistory.length <= 50, true);
});

Deno.test("Input Handling - Multiline editing", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Test multiline mode detection and handling
    
    // Start with a single line that should trigger multiline mode
    const line1 = "(fn factorial [n]";
    state.parenBalance = updateParenBalance(line1, 0, state.bracketStack);
    state.multilineMode = state.parenBalance > 0;
    state.multilineInput = line1;
    
    // Verify we're in multiline mode
    assertEquals(state.multilineMode, true);
    assertEquals(state.parenBalance > 0, true);
    
    // Add a second line
    const line2 = "  (if (<= n 1)";
    state.parenBalance = updateParenBalance(line2, state.parenBalance, state.bracketStack);
    state.multilineInput += "\n" + line2;
    
    // Still should be in multiline mode
    assertEquals(state.multilineMode, true);
    assertEquals(state.parenBalance > 0, true);
    
    // Add a third line that completes the input
    const line3 = "    1 (* n (factorial (- n 1)))))";
    state.parenBalance = updateParenBalance(line3, state.parenBalance, state.bracketStack);
    state.multilineInput += "\n" + line3;
    
    // Should have balanced parentheses now
    assertEquals(state.parenBalance, 0);
    
    // The complete multiline input should be valid
    const result = await executeHQL(state.multilineInput, evaluator);
    
    // Reset state
    resetReplState(state);
    assertEquals(state.multilineMode, false);
    
    // Test the function works
    const factResult = await executeHQL("(factorial 5)", evaluator);
    assertEquals(factResult.value, 120);
  } finally {
    await cleanup();
  }
});

// Test prompt generation
Deno.test("Input Handling - Prompt generation", () => {
  // Test with different states
  const testCases = [
    {
      state: { multilineMode: false, importHandlerActive: false, currentModule: "global", bracketStack: [] },
      expected: "hql[global]"
    },
    {
      state: { multilineMode: true, importHandlerActive: false, currentModule: "test", bracketStack: [] },
      expected: "..."
    },
    {
      state: { multilineMode: false, importHandlerActive: true, currentModule: "global", bracketStack: [] },
      expected: "import>"
    }
  ];
  
  for (const { state, expected } of testCases) {
    const prompt = getPrompt(state, false);
    assertStringIncludes(prompt, expected);
  }
});