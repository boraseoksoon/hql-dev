// test/repl/repl-test-framework.ts
// Main test framework for REPL testing with correct HQL syntax

import { assertEquals, assertStringIncludes, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { join, dirname, fromFileUrl } from "https://deno.land/std@0.224.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { assertSpyCall, spy, Spy } from "https://deno.land/std@0.224.0/testing/mock.ts";

// Import our REPL components for testing
import { ReplState, resetReplState, updateParenBalance } from "../../src/repl/repl-state.ts";
import { ModuleAwareEvaluator } from "../../src/repl/module-aware-evaluator.ts";
import { REPLEnvironment } from "../../src/repl/repl-environment.ts";
import { Environment } from "../../src/environment.ts";
import { startRepl } from "../../src/repl/repl.ts";
import { handleJsEvaluationError, formatValue, colorText } from "../../src/repl/repl-common.ts";
import { executeCommand } from "../../src/repl/command-executor.ts";
import { persistentStateManager } from "../../src/repl/persistent-state-manager.ts";
import { historyManager } from "../../src/repl/history-manager.ts";
import { Logger } from "../../src/logger.ts";

// Mock console functions to test output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

/**
 * Record of console output
 */
export interface ConsoleOutput {
  logs: string[];
  errors: string[];
  warnings: string[];
}

/**
 * Mock console for testing
 */
export function mockConsole(): ConsoleOutput & { restore: () => void } {
  const output: ConsoleOutput = {
    logs: [],
    errors: [],
    warnings: []
  };
  
  console.log = (...args: any[]) => {
    output.logs.push(args.map(arg => String(arg)).join(' '));
  };
  
  console.error = (...args: any[]) => {
    output.errors.push(args.map(arg => String(arg)).join(' '));
  };
  
  console.warn = (...args: any[]) => {
    output.warnings.push(args.map(arg => String(arg)).join(' '));
  };
  
  return {
    ...output,
    restore: () => {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
    }
  };
}

/**
 * Mock stdin for testing
 */
export function mockStdin(inputLines: string[]): { restore: () => void } {
  const originalRead = Deno.stdin.read;
  let lineIndex = 0;
  
  // Mock read function
  Deno.stdin.read = async (buf: Uint8Array): Promise<number | null> => {
    if (lineIndex >= inputLines.length) {
      return null;
    }
    
    const line = inputLines[lineIndex++] + '\n';
    const bytes = new TextEncoder().encode(line);
    buf.set(bytes);
    return bytes.length;
  };
  
  return {
    restore: () => {
      Deno.stdin.read = originalRead;
    }
  };
}

/**
 * Mock stdout for testing
 */
export function mockStdout(): { output: string, restore: () => void } {
  const originalWrite = Deno.stdout.write;
  let output = '';
  
  Deno.stdout.write = async (buf: Uint8Array): Promise<number> => {
    const text = new TextDecoder().decode(buf);
    output += text;
    return buf.length;
  };
  
  return {
    get output() { return output; },
    restore: () => {
      Deno.stdout.write = originalWrite;
    }
  };
}

// Keep track of all temp directories created for cleanup
const tempDirs: string[] = [];

// Store test sequence number to create unique module names for tests
let testSequence = 0;

/**
 * Create an isolated test environment
 * This creates an environment with a unique module name to prevent variable collisions
 */
export async function createTestEnvironment(): Promise<{
  env: Environment;
  evaluator: ModuleAwareEvaluator;
  replEnv: REPLEnvironment;
  state: ReplState;
  cleanup: () => Promise<void>;
}> {
  // Increment test sequence to ensure each test has a unique module
  testSequence++;
  
  // Create a temporary directory with a unique name for this test
  const tempDir = await Deno.makeTempDir({ prefix: `hql_repl_test_${testSequence}_` });
  tempDirs.push(tempDir);
  
  // Create a clean environment
  const env = await Environment.initializeGlobalEnv({ verbose: false });
  
  // Create a unique module name for this test to prevent variable collisions
  const moduleName = `test_module_${testSequence}`;
  
  // Create the evaluator
  const evaluator = new ModuleAwareEvaluator(env, {
    verbose: false,
    baseDir: tempDir,
    showAst: false,
    showExpanded: false,
    showJs: false,
  });
  
  // Initialize the evaluator
  await evaluator.initialize();
  
  // Switch to a unique module for this test (not global)
  await evaluator.switchModule(moduleName);
  
  // Extract the REPL environment
  const replEnv = evaluator.getREPLEnvironment();
  
  // Create a clean state
  const state: ReplState = {
    multilineMode: false,
    multilineInput: "",
    parenBalance: 0,
    importHandlerActive: false,
    currentModule: moduleName,
    bracketStack: []
  };
  
  // Return the created environment and a cleanup function
  return {
    env,
    evaluator,
    replEnv,
    state,
    cleanup: async () => {
      // Wait for any pending operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Force sync any pending state
      persistentStateManager.forceSync();
      
      // Clean up the temp directory
      try {
        await Deno.remove(tempDir, { recursive: true });
        // Remove from our list
        const index = tempDirs.indexOf(tempDir);
        if (index !== -1) {
          tempDirs.splice(index, 1);
        }
      } catch (e) {
        console.warn(`Failed to clean up temp directory: ${e}`);
      }
    }
  };
}

// Cleanup handler for all temp directories at process exit
Deno.addSignalListener("SIGINT", async () => {
  await cleanupAllTempDirs();
  Deno.exit(1);
});

/**
 * Clean up all temporary directories created during testing
 */
export async function cleanupAllTempDirs(): Promise<void> {
  for (const dir of tempDirs) {
    try {
      await Deno.remove(dir, { recursive: true });
    } catch (e) {
      console.warn(`Failed to clean up temp directory ${dir}: ${e}`);
    }
  }
  tempDirs.length = 0;
}

/**
 * Test runner for REPL commands
 */
export async function testCommand(
  cmd: string, 
  args: string, 
  evaluator: ModuleAwareEvaluator, 
  state: ReplState
): Promise<ConsoleOutput> {
  // Mock console output
  const consoleOutput = mockConsole();
  
  // Common options
  const commonOptions = {
    baseDir: Deno.cwd(),
    showAst: false,
    showExpanded: false,
    showJs: false,
    useColors: false,
  };
  
  // State handlers
  const stateHandlers = {
    setRunning: (val: boolean) => {},
    setVerbose: (val: boolean) => {},
    setShowAst: (val: boolean) => {},
    setShowExpanded: (val: boolean) => {},
    setShowJs: (val: boolean) => {},
  };
  
  try {
    // Create a simple logger that matches the expected interface
    const logger: Logger = {
      enabled: false,
      isVerbose: false,
      setEnabled: (val: boolean) => {},
      log: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      isNamespaceEnabled: () => false
    };
    
    // Execute the command
    await executeCommand(
      cmd,
      args,
      evaluator,
      state,
      false, // useColors
      logger,
      stateHandlers,
      commonOptions
    );
    
    return consoleOutput;
  } finally {
    consoleOutput.restore();
  }
}

/**
 * Execute HQL code in test environment
 */
export async function executeHQL(
  code: string,
  evaluator: ModuleAwareEvaluator
): Promise<any> {
  try {
    // Execute the HQL code
    const result = await evaluator.evaluate(code, {
      verbose: false,
      showAst: false,
      showExpanded: false,
      showJs: false,
    });
    
    return result;
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error executing HQL: ${error.message}`);
    } else {
      console.error(`Unknown error executing HQL: ${String(error)}`);
    }
    throw error;
  }
}

/**
 * Verify a module contains expected symbols
 */
export async function verifyModuleContainsSymbols(
  evaluator: ModuleAwareEvaluator,
  moduleName: string,
  expectedSymbols: string[]
): Promise<boolean> {
  // Switch to the module
  await evaluator.switchModule(moduleName);
  
  // Get module symbols
  const environment = evaluator.getREPLEnvironment();
  // Get the symbols using the appropriate method from the environment
  const symbols = await evaluator.listModuleSymbols(moduleName);
  
  // Check all expected symbols are present
  for (const symbol of expectedSymbols) {
    if (!symbols.includes(symbol)) {
      console.error(`Missing symbol: ${symbol} in module ${moduleName}`);
      return false;
    }
  }
  
  return true;
}

/**
 * Wait for a specified time
 */
export async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}