// tests/repl/repl-command-test.ts
// Tests for REPL commands using correct HQL syntax

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { 
  createTestEnvironment, 
  mockConsole, 
  executeHQL,
  testCommand,
  wait
} from "./repl-test-framework.ts";

Deno.test("Commands - Help command", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Basic help command
    const helpOutput = await testCommand("help", "", evaluator, state);
    assertEquals(helpOutput.errors.length, 0);
    
    // Verify help includes common commands
    const commands = ["quit", "env", "macros", "go", "modules", "list", "find", "see", "doc", "remove"];
    for (const cmd of commands) {
      const hasCommand = helpOutput.logs.some(line => line.includes(cmd));
      assertEquals(hasCommand, true, `Help should include ${cmd} command`);
    }
    
    // Detailed help for a specific command
    const listHelpOutput = await testCommand("help", "list", evaluator, state);
    assertEquals(listHelpOutput.errors.length, 0);
    const hasListDetails = listHelpOutput.logs.some(
      line => line.includes("list") && line.includes("Show symbols")
    );
    assertEquals(hasListDetails, true);
    
    // Help for CLI commands
    const cliHelpOutput = await testCommand("help", "cli", evaluator, state);
    assertEquals(cliHelpOutput.errors.length, 0);
    const hasCliInfo = cliHelpOutput.logs.some(line => line.includes("CLI-Style Commands"));
    assertEquals(hasCliInfo, true);
  } finally {
    await cleanup();
  }
});

Deno.test("Commands - Environment display", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Define some test symbols
    await executeHQL("(let test-var 42)", evaluator);
    await executeHQL("(fn test-fn [x] (* x 2))", evaluator);
    
    // Test env command
    const envOutput = await testCommand("env", "", evaluator, state);
    assertEquals(envOutput.errors.length, 0);
    
    // Should include defined symbols
    const hasVar = envOutput.logs.some(line => line.includes("test-var"));
    const hasFn = envOutput.logs.some(line => line.includes("test-fn"));
    assertEquals(hasVar, true);
    assertEquals(hasFn, true);
    
    // Test macros command
    await executeHQL("(defmacro test-macro [x] `(+ ~x 1))", evaluator);
    const macrosOutput = await testCommand("macros", "", evaluator, state);
    assertEquals(macrosOutput.errors.length, 0);
    
    // Should include defined macro
    const hasMacro = macrosOutput.logs.some(line => line.includes("test-macro"));
    assertEquals(hasMacro, true);
  } finally {
    await cleanup();
  }
});

Deno.test("Commands - See command", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Define test symbols
    await executeHQL("(let answer 42)", evaluator);
    await executeHQL("(fn square [x] (* x x))", evaluator);
    
    // Test :see with no arguments (shows current module)
    const seeEmptyOutput = await testCommand("see", "", evaluator, state);
    assertEquals(seeEmptyOutput.errors.length, 0);
    const hasCurrentModule = seeEmptyOutput.logs.some(
      line => line.includes("Current Module") && line.includes("global")
    );
    assertEquals(hasCurrentModule, true);
    
    // Test :see for a specific symbol
    const seeSymbolOutput = await testCommand("see", "square", evaluator, state);
    assertEquals(seeSymbolOutput.errors.length, 0);
    const hasSymbolDef = seeSymbolOutput.logs.some(
      line => line.includes("Definition of") && line.includes("square")
    );
    assertEquals(hasSymbolDef, true);
    const hasCode = seeSymbolOutput.logs.some(line => line.includes("(* x x)"));
    assertEquals(hasCode, true);
    
    // Test :see all modules
    const seeAllModulesOutput = await testCommand("see", "all:modules", evaluator, state);
    assertEquals(seeAllModulesOutput.errors.length, 0);
    const hasModuleList = seeAllModulesOutput.logs.some(line => line.includes("Module names"));
    assertEquals(hasModuleList, true);
    
    // Create a new module and test :see <module>
    await testCommand("mkdir", "test-mod", evaluator, state);
    await testCommand("go", "test-mod", evaluator, state);
    await executeHQL("(let test-val 99)", evaluator);
    await testCommand("go", "global", evaluator, state);
    
    const seeModuleOutput = await testCommand("see", "test-mod", evaluator, state);
    assertEquals(seeModuleOutput.errors.length, 0);
    const hasModuleDetail = seeModuleOutput.logs.some(line => line.includes("Module: test-mod"));
    assertEquals(hasModuleDetail, true);
    const hasModuleSymbol = seeModuleOutput.logs.some(line => line.includes("test-val"));
    assertEquals(hasModuleSymbol, true);
  } finally {
    await cleanup();
  }
});

Deno.test("Commands - Documentation", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Define a function with docstring
    await executeHQL(`
      (fn add-numbers 
        "Adds two numbers together and returns the sum"
        (a b)
        (+ a b))
    `, evaluator);
    
    // Test doc command for user-defined function
    const docOutput = await testCommand("doc", "add-numbers", evaluator, state);
    assertEquals(docOutput.errors.length, 0);
    const hasDocstring = docOutput.logs.some(line => 
      line.includes("adds two numbers") || line.includes("Adds two numbers")
    );
    assertEquals(hasDocstring, true);
    
    // Test doc for built-in function
    const builtinDocOutput = await testCommand("doc", "+", evaluator, state);
    assertEquals(builtinDocOutput.errors.length, 0);
    const hasBuiltinDoc = builtinDocOutput.logs.some(
      line => line.includes("Adds numbers") || line.includes("adds numbers")
    );
    assertEquals(hasBuiltinDoc, true);
    
    // Test doc for module
    await testCommand("mkdir", "doc-test", evaluator, state);
    await testCommand("go", "doc-test", evaluator, state);
    await executeHQL("(let x 1)", evaluator);
    await executeHQL("(let y 2)", evaluator);
    await testCommand("go", "global", evaluator, state);
    
    const moduleDocOutput = await testCommand("doc", "doc-test/*", evaluator, state);
    assertEquals(moduleDocOutput.errors.length, 0);
    const hasModuleDoc = moduleDocOutput.logs.some(line => line.includes("Module: doc-test"));
    assertEquals(hasModuleDoc, true);
    
    // Test doc for nonexistent symbol
    const nonexistentDocOutput = await testCommand("doc", "nonexistent", evaluator, state);
    const hasNotFound = nonexistentDocOutput.logs.some(line => line.includes("not found"));
    assertEquals(hasNotFound, true);
  } finally {
    await cleanup();
  }
});

Deno.test("Commands - CLI-style commands", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Setup test data
    await executeHQL("(let sample 42)", evaluator);
    await executeHQL("(fn test-fn [] 'hello)", evaluator);
    
    // Test ls (equivalent to :list)
    const lsOutput = await testCommand("ls", "", evaluator, state);
    assertEquals(lsOutput.errors.length, 0);
    const hasSample = lsOutput.logs.some(line => line.includes("sample"));
    const hasTestFn = lsOutput.logs.some(line => line.includes("test-fn"));
    assertEquals(hasSample, true);
    assertEquals(hasTestFn, true);
    
    // Test mkdir and cd
    await testCommand("mkdir", "cli-test", evaluator, state);
    const cdOutput = await testCommand("cd", "cli-test", evaluator, state);
    assertEquals(cdOutput.errors.length, 0);
    assertEquals(state.currentModule, "cli-test");
    
    // Test pwd
    const pwdOutput = await testCommand("pwd", "", evaluator, state);
    assertEquals(pwdOutput.errors.length, 0);
    const hasCurrentModule = pwdOutput.logs.some(line => line.includes("cli-test"));
    assertEquals(hasCurrentModule, true);
    
    // Test cd back to global
    await testCommand("cd", "global", evaluator, state);
    assertEquals(state.currentModule, "global");
    
    // Test rm for symbols
    await executeHQL("(let to-be-removed 999)", evaluator);
    const rmOutput = await testCommand("rm", "-f to-be-removed", evaluator, state);
    assertEquals(rmOutput.errors.length, 0);
    
    // Verify symbol was removed
    try {
      await executeHQL("to-be-removed", evaluator);
      throw new Error("Symbol should have been removed");
    } catch (error: unknown) {
      if (error instanceof Error) {
        assertStringIncludes(error.message, "not defined");
      } else {
        throw new Error(`Unexpected error type: ${String(error)}`);
      }
    }
    
    // Test man (equivalent to :help)
    const manOutput = await testCommand("man", "ls", evaluator, state);
    assertEquals(manOutput.errors.length, 0);
    const hasLsHelp = manOutput.logs.some(line => 
      line.includes("ls") && line.includes("List symbols")
    );
    assertEquals(hasLsHelp, true);
  } finally {
    await cleanup();
  }
});

Deno.test("Commands - Remove command", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    // Setup test data
    await executeHQL("(let to-remove-val 42)", evaluator);
    await executeHQL("(fn to-remove-fn [x] (* x 2))", evaluator);
    
    // Create test modules
    await testCommand("mkdir", "remove-test", evaluator, state);
    await testCommand("go", "remove-test", evaluator, state);
    await executeHQL("(let module-val 99)", evaluator);
    await testCommand("go", "global", evaluator, state);
    
    // Test removing a symbol
    const rmSymbolOutput = await testCommand("remove", "-f to-remove-val", evaluator, state);
    assertEquals(rmSymbolOutput.errors.length, 0);
    
    // Verify symbol was removed
    try {
      await executeHQL("to-remove-val", evaluator);
      throw new Error("Symbol should have been removed");
    } catch (error: unknown) {
      if (error instanceof Error) {
        assertStringIncludes(error.message, "not defined");
      } else {
        throw new Error(`Unexpected error type: ${String(error)}`);
      }
    }
    
    // Test removing a module
    const rmModuleOutput = await testCommand("remove", "-f remove-test", evaluator, state);
    assertEquals(rmModuleOutput.errors.length, 0);
    
    // Verify module was removed
    const modulesOutput = await testCommand("modules", "", evaluator, state);
    const hasRemovedModule = modulesOutput.logs.some(line => line.includes("remove-test"));
    assertEquals(hasRemovedModule, false);
    
    // Test removing with module:symbol format
    await testCommand("mkdir", "mod1", evaluator, state);
    await testCommand("go", "mod1", evaluator, state);
    await executeHQL("(let special-val 777)", evaluator);
    await testCommand("go", "global", evaluator, state);
    
    const rmModuleSymbolOutput = await testCommand("remove", "-f mod1:special-val", evaluator, state);
    assertEquals(rmModuleSymbolOutput.errors.length, 0);
    
    // Verify symbol was removed from that module
    await testCommand("go", "mod1", evaluator, state);
    try {
      await executeHQL("special-val", evaluator);
      throw new Error("Symbol should have been removed");
    } catch (error: unknown) {
      if (error instanceof Error) {
        assertStringIncludes(error.message, "not defined");
      } else {
        throw new Error(`Unexpected error type: ${String(error)}`);
      }
    }
  } finally {
    await cleanup();
  }
});

Deno.test("Commands - Toggle debug options", async () => {
  const { evaluator, state, cleanup } = await createTestEnvironment();
  
  try {
    let consoleOutput;
    
    // Test verbose toggle
    consoleOutput = await testCommand("verbose", "", evaluator, state);
    assertEquals(consoleOutput.errors.length, 0);
    const verboseEnabled = consoleOutput.logs.some(line => line.includes("enabled"));
    
    // Toggle again should disable
    consoleOutput = await testCommand("verbose", "", evaluator, state);
    assertEquals(consoleOutput.errors.length, 0);
    const verboseDisabled = consoleOutput.logs.some(line => line.includes("disabled"));
    
    // Either enable->disable or disable->enable sequence should work
    assertEquals(verboseEnabled || verboseDisabled, true);
    
    // Test AST display toggle
    consoleOutput = await testCommand("ast", "", evaluator, state);
    assertEquals(consoleOutput.errors.length, 0);
    const astToggled = consoleOutput.logs.some(
      line => line.includes("AST display") && 
      (line.includes("enabled") || line.includes("disabled"))
    );
    assertEquals(astToggled, true);
    
    // Test JavaScript display toggle
    consoleOutput = await testCommand("js", "", evaluator, state);
    assertEquals(consoleOutput.errors.length, 0);
    const jsToggled = consoleOutput.logs.some(
      line => line.includes("JavaScript") && 
      (line.includes("enabled") || line.includes("disabled"))
    );
    assertEquals(jsToggled, true);
    
    // Test expanded form toggle
    consoleOutput = await testCommand("expanded", "", evaluator, state);
    assertEquals(consoleOutput.errors.length, 0);
    const expandedToggled = consoleOutput.logs.some(
      line => line.includes("Expanded form") && 
      (line.includes("enabled") || line.includes("disabled"))
    );
    assertEquals(expandedToggled, true);
  } finally {
    await cleanup();
  }
});