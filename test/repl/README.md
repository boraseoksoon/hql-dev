# HQL REPL Testing Suite

This directory contains tests for the HQL REPL functionality. These tests help ensure that REPL features continue to work correctly as new features are added or existing ones are modified.

## Test Categories

The tests are divided into several categories:

- **Core Tests**: Basic REPL functionality including state management, evaluation, and utility functions
- **Command Tests**: Tests for REPL commands such as `:help`, `:env`, `:see`, etc.
- **Module Tests**: Tests for module creation, switching, and interactions
- **Error Tests**: Tests for error handling and recovery
- **Persistence Tests**: Tests for state persistence across evaluations
- **Input Tests**: Tests for input handling, tab completion, and history
- **Integration Tests**: Comprehensive tests combining multiple REPL features

## Running Tests

Tests can be run using the Deno task runner. To run all tests:

```bash
deno task test-repl
```

To run a specific test category:

```bash
deno task test-repl-core
deno task test-repl-command
deno task test-repl-module
deno task test-repl-error
deno task test-repl-persistence
deno task test-repl-input
deno task test-repl-integration
```

Alternatively, you can specify the category directly:

```bash
deno task test-repl core
```

## Test Framework

The test framework in `repl-test-framework.ts` provides the following features:

- Isolated test environments for each test case
- Mock console, stdin, and stdout functions
- Utilities for executing HQL code and REPL commands
- Automatic cleanup of temporary files

## Adding New Tests

When adding new tests:

1. Place them in the appropriate category file
2. Use the `createTestEnvironment()` function to create an isolated environment
3. Use the `executeHQL()` function to test code evaluation
4. Use the `testCommand()` function to test REPL commands
5. Always call the `cleanup()` function in a finally block

Example:

```typescript
Deno.test("My new test", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Test code here
    await executeHQL("(let x 42)", evaluator);
    const result = await executeHQL("(+ x 1)", evaluator);
    assertEquals(result.value, 43);
  } finally {
    await cleanup();
  }
});
```

## HQL Syntax in Tests

Remember that HQL uses Lisp-like syntax with parentheses for function calls:

- Function definitions: `(fn name (param1 param2) body)`
- Variable definitions: `(let name value)`
- Function calls: `(function-name arg1 arg2)`
- Arrays: `[1, 2, 3]`
- Maps: `{"key": "value"}`
- Property access: `object.property` or `(get object "property")`
- Array access: `array[index]` or `(get array index)`

## Common Issues

- **Variable redeclaration**: Each test should run in its own module to prevent conflicts
- **Syntax errors**: Ensure you're using the correct HQL syntax with parentheses, not square brackets
- **Missing functions**: Make sure the functions you're testing exist in the environment 