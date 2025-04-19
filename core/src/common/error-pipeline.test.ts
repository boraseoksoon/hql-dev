// error-pipeline.test.ts - Tests for the unified error handling pipeline

import {
  processError,
  withErrorPipeline,
  withSyncErrorPipeline,
  ErrorHandlerOptions,
  TranspilerError,
  ParseError,
  ImportError,
  ValidationError
} from './error-pipeline.ts';

// Mock console.error to avoid test output pollution
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  // Uncomment to enable error messages during testing
  // originalConsoleError(...args);
};

// Helper to restore original console.error after tests
function restoreConsoleError() {
  console.error = originalConsoleError;
}

// Test the processError function
Deno.test("processError should convert unknown errors to Error objects", () => {
  const result = processError("This is a string error", { logErrors: false });
  
  if (!(result instanceof Error)) {
    throw new Error("Expected result to be an Error object");
  }
  
  if (!result.message.includes("This is a string error")) {
    throw new Error(`Error message incorrect: ${result.message}`);
  }
});

Deno.test("processError should preserve Error instances", () => {
  const originalError = new Error("Original error message");
  const result = processError(originalError, { logErrors: false });
  
  if (!(result instanceof Error)) {
    throw new Error("Expected result to be an Error object");
  }
  
  if (!result.message.includes("Original error message")) {
    throw new Error(`Error message incorrect: ${result.message}`);
  }
});

Deno.test("processError should enhance error objects with line/column data", () => {
  // Create an error with line/column information in the message
  const originalError = new Error("Error at line 42:12 in the code");
  const result = processError(originalError, { logErrors: false });
  
  // Check that the error is enhanced properly
  if (result instanceof TranspilerError) {
    if (result.line !== 42 || result.column !== 12) {
      throw new Error(`Expected line 42, column 12, got line ${result.line}, column ${result.column}`);
    }
  } else {
    throw new Error("Expected result to be a TranspilerError");
  }
});

Deno.test("processError should categorize syntax errors", () => {
  // Create a syntax error message
  const syntaxError = new Error("Unexpected token { at line 10");
  const result = processError(syntaxError, { logErrors: false, source: "let x = {" });
  
  if (!(result instanceof ParseError)) {
    throw new Error(`Expected ParseError, got ${result.constructor.name}`);
  }
});

Deno.test("processError should categorize import errors", () => {
  // Create an import error message
  const importError = new Error("Cannot find module 'missing-module'");
  const result = processError(importError, { logErrors: false });
  
  if (!(result instanceof ImportError)) {
    throw new Error(`Expected ImportError, got ${result.constructor.name}`);
  }
  
  if (!(result as ImportError).importPath.includes("missing-module")) {
    throw new Error(`Import path incorrect: ${(result as ImportError).importPath}`);
  }
});

Deno.test("processError should categorize type errors", () => {
  // Create a type error message
  const typeError = new Error("Type 'string' is not assignable to type 'number'");
  const result = processError(typeError, { logErrors: false });
  
  if (!(result instanceof ValidationError)) {
    throw new Error(`Expected ValidationError, got ${result.constructor.name}`);
  }
});

// Test error pipeline wrappers
Deno.test("withErrorPipeline should handle async function errors", async () => {
  const failingFunction = async () => {
    throw new Error("Async function error");
  };
  
  const wrappedFunction = withErrorPipeline(failingFunction, { 
    logErrors: false, 
    rethrow: true 
  });
  
  try {
    await wrappedFunction();
    throw new Error("Expected function to throw");
  } catch (error: unknown) {
    if (!(error instanceof Error) || !error.message.includes("Async function error")) {
      throw new Error(`Unexpected error message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});

Deno.test("withSyncErrorPipeline should handle sync function errors", () => {
  const failingFunction = () => {
    throw new Error("Sync function error");
  };
  
  const wrappedFunction = withSyncErrorPipeline(failingFunction, { 
    logErrors: false, 
    rethrow: true 
  });
  
  try {
    wrappedFunction();
    throw new Error("Expected function to throw");
  } catch (error: unknown) {
    if (!(error instanceof Error) || !error.message.includes("Sync function error")) {
      throw new Error(`Unexpected error message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});

Deno.test("withErrorPipeline should return undefined when rethrow is false", async () => {
  const failingFunction = async () => {
    throw new Error("This error should be caught");
  };
  
  const wrappedFunction = withErrorPipeline(failingFunction, { 
    logErrors: false, 
    rethrow: false 
  });
  
  const result = await wrappedFunction();
  if (result !== undefined) {
    throw new Error(`Expected undefined, got ${result}`);
  }
});

// Clean up
restoreConsoleError(); 