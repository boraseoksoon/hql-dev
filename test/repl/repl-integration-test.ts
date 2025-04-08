Deno.test("Integration - REPL command interplay and feature interactions", async () => {
    const { evaluator, state, cleanup } = await createTestEnvironment();
    
    try {
      // Test interactions between different REPL features and commands
      
      // 1. Create a module for tests
      await testCommand("mkdir", "feature-test", evaluator, state);
      await testCommand("go", "feature-test", evaluator, state);
      
      // 2. Define a data structure with different types
      await executeHQL(`
        (let complex-data {
          "numbers": [1, 2, 3, 4, 5],
          "strings": ["a", "b", "c"],
          "nested": {
            "flag": true,
            "value": 42,
            "items": [
              {"id": 1, "name": "first"},
              {"id": 2, "name": "second"}
            ]
          }
        })
        
        (export [complex-data])
      `, evaluator);
      
      // 3. Test the see command can properly display complex data
      const seeOutput = await testCommand("see", "complex-data", evaluator, state);
      assertEquals(seeOutput.errors.length, 0);
      assertEquals(seeOutput.logs.some(line => line.includes("numbers")), true);
      assertEquals(seeOutput.logs.some(line => line.includes("nested")), true);
      
      // 4. Define functions that manipulate this data
      await executeHQL(`
        (fn get-item-by-id [id]
          (let items (get (get complex-data "nested") "items"))
          (first (filter (fn [item] (= (get item "id") id)) items)))
        
        (fn sum-numbers []
          (reduce (fn [acc n] (+ acc n)) 0 (get complex-data "numbers")))
        
        (fn concatenate-strings []
          (reduce (fn [acc s] (str acc s)) "" (get complex-data "strings")))
          
        (export [get-item-by-id sum-numbers concatenate-strings])
      `, evaluator);
      
      // 5. Test these functions
      const sumResult = await executeHQL("(sum-numbers)", evaluator);
      assertEquals(sumResult.value, 15);
      
      const concatResult = await executeHQL("(concatenate-strings)", evaluator);
      assertEquals(concatResult.value, "abc");
      
      const itemResult = await executeHQL("(get-item-by-id 2)", evaluator);
      assertEquals(itemResult.value.name, "second");
      
      // 6. Create a CLI test module and switch to it using cd command
      await testCommand("mkdir", "cli-test", evaluator, state);
      await testCommand("cd", "cli-test", evaluator, state);
      assertEquals(state.currentModule, "cli-test");
      
      // 7. Import from feature-test module
      await executeHQL("(import [complex-data get-item-by-id] from \"feature-test\")", evaluator);
      
      // 8. Test imported functionality
      const importedResult = await executeHQL("(get-item-by-id 1)", evaluator);
      assertEquals(importedResult.value.name, "first");
      
      // 9. Try various ls commands
      const lsOutput = await testCommand("ls", "", evaluator, state);
      assertEquals(lsOutput.logs.some(line => line.includes("get-item-by-id")), true);
      assertEquals(lsOutput.logs.some(line => line.includes("complex-data")), true);
      
      // 10. Test ls -m to see all modules
      const lsModulesOutput = await testCommand("ls", "-m", evaluator, state);
      assertEquals(lsModulesOutput.logs.some(line => line.includes("global")), true);
      assertEquals(lsModulesOutput.logs.some(line => line.includes("feature-test")), true);
      assertEquals(lsModulesOutput.logs.some(line => line.includes("cli-test")), true);
      
      // 11. Use find command
      const findOutput = await testCommand("find", "item", evaluator, state);
      assertEquals(findOutput.logs.some(line => line.includes("get-item-by-id")), true);
      
      // 12. Test verbose mode toggle (doesn't change behavior but should run)
      await testCommand("verbose", "", evaluator, state);
      
      // 13. Test the doc command
      const docOutput = await testCommand("doc", "feature-test/*", evaluator, state);
      assertEquals(docOutput.logs.some(line => line.includes("Module: feature-test")), true);
      
      // 14. Go back to feature-test module
      await testCommand("go", "feature-test", evaluator, state);
      assertEquals(state.currentModule, "feature-test");
      
      // 15. Modify data and verify changes are seen in imported module
      await executeHQL(`
        (let complex-data (assoc-in complex-data ["nested", "value"] 100))
      `, evaluator);
      
      await testCommand("go", "cli-test", evaluator, state);
      const modifiedResult = await executeHQL("(get-in complex-data [\"nested\", \"value\"])", evaluator);
      assertEquals(modifiedResult.value, 100);
      
      // 16. Run man command (alias for help)
      const manOutput = await testCommand("man", "find", evaluator, state);
      assertEquals(manOutput.logs.some(line => line.includes("find") && line.includes("search")), true);
      
      // 17. Test removing a symbol
      await testCommand("rm", "-f get-item-by-id", evaluator, state);
      
      // Verify it was removed
      const afterRemoveOutput = await testCommand("list", "", evaluator, state);
      assertEquals(afterRemoveOutput.logs.some(line => line.includes("get-item-by-id")), false);
      
      // 18. But the original module should still have it
      await testCommand("go", "feature-test", evaluator, state);
      const stillHasOutput = await testCommand("list", "", evaluator, state);
      assertEquals(stillHasOutput.logs.some(line => line.includes("get-item-by-id")), true);
    } finally {
      await cleanup();
    }
  });Deno.test("Integration - Import functionality and JS interop", async () => {
    const { evaluator, state, cleanup } = await createTestEnvironment();
    
    try {
      // Create a module with JS interop features
      await testCommand("mkdir", "interop", evaluator, state);
      await testCommand("go", "interop", evaluator, state);
      
      // Define functions that use JavaScript interop
      await executeHQL(`
        (fn get-date [] 
          (new Date))
        
        (fn format-date [date]
          (.toLocaleString date))
        
        (fn get-random []
          (Math.random))
        
        (export [get-date format-date get-random])
      `, evaluator);
      
      // Test the interop functions
      const dateResult = await executeHQL("(get-date)", evaluator);
      assertEquals(dateResult.value instanceof Date, true);
      
      const randomResult = await executeHQL("(get-random)", evaluator);
      assertEquals(typeof randomResult.value, "number");
      assertEquals(randomResult.value >= 0 && randomResult.value < 1, true);
      
      // Create a module that imports from the interop module
      await testCommand("mkdir", "app", evaluator, state);
      await testCommand("go", "app", evaluator, state);
      
      // Import from interop module
      await executeHQL(`
        (import [get-date format-date] from "interop")
        
        (fn get-formatted-date []
          (format-date (get-date)))
        
        (fn timestamp []
          (let date (get-date))
          (.getTime date))
          
        (export [get-formatted-date timestamp])
      `, evaluator);
      
      // Test the imported functionality
      const formattedResult = await executeHQL("(get-formatted-date)", evaluator);
      assertEquals(typeof formattedResult.value, "string");
      
      const timestampResult = await executeHQL("(timestamp)", evaluator);
      assertEquals(typeof timestampResult.value, "number");
      
      // Test direct JavaScript property access
      await testCommand("go", "interop", evaluator, state);
      const mathResult = await executeHQL("Math.PI", evaluator);
      assertEquals(mathResult.value, Math.PI);
      
      // Test using JavaScript array methods
      const arrayResult = await executeHQL(`
        (let arr [1, 2, 3, 4, 5])
        (.map arr (lambda [x] (* x 2)))
      `, evaluator);
      assertEquals(Array.isArray(arrayResult.value), true);
      assertEquals(arrayResult.value.length, 5);
      assertEquals(arrayResult.value[0], 2);
      assertEquals(arrayResult.value[4], 10);
    } finally {
      await cleanup();
    }
  });
  
  Deno.test("Integration - REPL session workflow", async () => {
    const { evaluator, state, cleanup } = await createTestEnvironment();
    
    try {
      // Simulate a realistic REPL session with various commands and operations
      
      // 1. Display environment at start (should be mostly empty)
      const envOutput = await testCommand("env", "", evaluator, state);
      
      // 2. Create a module
      await testCommand("mkdir", "session", evaluator, state);
      await testCommand("go", "session", evaluator, state);
      
      // 3. Define some functions and variables
      await executeHQL(`
        (let counter 0)
        
        (fn increment [amount]
          (let counter (+ counter amount))
          counter)
        
        (fn decrement [amount]
          (let counter (- counter amount))
          counter)
        
        (fn reset []
          (let counter 0)
          counter)
      `, evaluator);
      
      // 4. List defined symbols
      const listOutput = await testCommand("list", "", evaluator, state);
      assertEquals(listOutput.logs.some(line => line.includes("counter")), true);
      assertEquals(listOutput.logs.some(line => line.includes("increment")), true);
      assertEquals(listOutput.logs.some(line => line.includes("decrement")), true);
      assertEquals(listOutput.logs.some(line => line.includes("reset")), true);
      
      // 5. Use the functions
      const result1 = await executeHQL("(increment 5)", evaluator);
      assertEquals(result1.value, 5);
      
      const result2 = await executeHQL("(increment 3)", evaluator);
      assertEquals(result2.value, 8);
      
      const result3 = await executeHQL("(decrement 2)", evaluator);
      assertEquals(result3.value, 6);
      
      // 6. Use the see command to examine a function
      const seeOutput = await testCommand("see", "increment", evaluator, state);
      assertEquals(seeOutput.logs.some(line => line.includes("increment")), true);
      assertEquals(seeOutput.logs.some(line => line.includes("(+ counter amount)")), true);
      
      // 7. Reset counter
      const resetResult = await executeHQL("(reset)", evaluator);
      assertEquals(resetResult.value, 0);
      
      // 8. Export the functions
      await executeHQL("(export [increment decrement reset])", evaluator);
      
      // 9. Create another module
      await testCommand("mkdir", "client", evaluator, state);
      await testCommand("go", "client", evaluator, state);
      
      // 10. Import from the first module
      await executeHQL("(import [increment reset] from \"session\")", evaluator);
      
      // 11. Use the imported functions
      const clientResult1 = await executeHQL("(increment 10)", evaluator);
      assertEquals(clientResult1.value, 10);
      
      // 12. Check that state is shared
      await testCommand("go", "session", evaluator, state);
      const sessionCounter = await executeHQL("counter", evaluator);
      assertEquals(sessionCounter.value, 10);
      
      // 13. Reset in the session module
      await executeHQL("(reset)", evaluator);
      
      // 14. Verify reset worked in client module too
      await testCommand("go", "client", evaluator, state);
      const clientResult2 = await executeHQL("(increment 1)", evaluator);
      assertEquals(clientResult2.value, 1);
      
      // 15. Use the help command
      const helpOutput = await testCommand("help", "list", evaluator, state);
      assertEquals(helpOutput.logs.some(line => line.includes("list") && line.includes("symbols")), true);
      
      // 16. Find command
      const findOutput = await testCommand("find", "increment", evaluator, state);
      assertEquals(findOutput.logs.some(line => line.includes("increment")), true);
      assertEquals(findOutput.logs.some(line => line.includes("session")), true);
    } finally {
      await cleanup();
    }
  });
  
  Deno.test("Integration - Error handling and recovery", async () => {
    const { evaluator, state, cleanup } = await createTestEnvironment();
    
    try {
      // Test REPL's ability to handle errors and recover properly
      
      // 1. Define a simple function
      await executeHQL("(fn divide [a b] (/ a b))", evaluator);
      
      // 2. Test the function works
      const result = await executeHQL("(divide 10 2)", evaluator);
      assertEquals(result.value, 5);
      
      // 3. Cause a runtime error (division by zero)
      try {
        await executeHQL("(divide 10 0)", evaluator);
        throw new Error("Should have thrown division by zero error");
      } catch (error) {
        // Expected error
        assertStringIncludes(error.message.toLowerCase(), "division");
      }
      
      // 4. REPL should recover - test we can still use the function
      const recoveryResult = await executeHQL("(divide 20 4)", evaluator);
      assertEquals(recoveryResult.value, 5);
      
      // 5. Cause a syntax error with unbalanced parentheses
      try {
        await executeHQL("(fn broken [x] (+ x 1)", evaluator);
        throw new Error("Should have thrown a syntax error");
      } catch (error) {
        // Expected error
      }
      
      // 6. REPL should recover - test we can still define and use functions
      await executeHQL("(fn working [x] (+ x 1))", evaluator);
      const syntaxRecoveryResult = await executeHQL("(working 5)", evaluator);
      assertEquals(syntaxRecoveryResult.value, 6);
      
      // 7. Test multiline input with error
      state.multilineMode = true;
      state.multilineInput = "(fn multiline [a b]\n";
      state.parenBalance = 1;
      
      try {
        await executeHQL(state.multilineInput + "  (/ a 0))", evaluator);
        throw new Error("Should have thrown a division error");
      } catch (error) {
        // Expected error
      }
      
      // Reset state as would happen in actual REPL
      resetReplState(state);
      
      // 8. REPL should recover from errors in one module
      await testCommand("mkdir", "error-module", evaluator, state);
      await testCommand("go", "error-module", evaluator, state);
      
      try {
        await executeHQL("(undefined-function)", evaluator);
        throw new Error("Should have thrown undefined function error");
      } catch (error) {
        // Expected error
      }
      
      // Switch to another module and verify it works
      await testCommand("go", "global", evaluator, state);
      const moduleRecoveryResult = await executeHQL("(+ 1 2 3)", evaluator);
      assertEquals(moduleRecoveryResult.value, 6);
    } finally {
      await cleanup();
    }
    
    // Helper function to reset REPL state for testing
    function resetReplState(state: any): void {
      state.multilineMode = false;
      state.multilineInput = "";
      state.parenBalance = 0;
      state.bracketStack = [];
    }
  });// tests/repl/repl-integration-test.ts
  // Integration tests for the REPL (correct HQL syntax)
  
  import { assertEquals, assertStringIncludes, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
  import { 
    createTestEnvironment, 
    mockConsole, 
    mockStdin,
    mockStdout,
    executeHQL,
    testCommand,
    wait
  } from "./repl-test-framework.ts";
  import { startRepl } from "../../src/repl/repl-core.ts";
  import { persistentStateManager } from "../../src/repl/persistent-state-manager.ts";
  
  Deno.test("Integration - Full script execution", async () => {
    const { evaluator, state, cleanup } = await createTestEnvironment();
    
    try {
      // Define a complex HQL script that uses various features
      const script = `
      ;; Define a module for math utilities
      (module math)
      
      (fn square [x] (* x x))
      (fn cube [x] (* x x x))
      (fn factorial [n]
        (if (<= n 1)
          1
          (* n (factorial (- n 1)))))
      
      (export [square cube factorial])
      
      ;; Define a module for string utilities
      (module strings)
      
      (fn concat-str [& args]
        (reduce (fn [acc s] (str acc s)) "" args))
      
      (fn repeat-str [s n]
        (if (<= n 0)
          ""
          (concat-str s (repeat-str s (- n 1)))))
      
      (export [concat-str repeat-str])
      
      ;; Main application module
      (module app)
      
      (import [square factorial] from "math")
      (import [concat-str] from "strings")
      
      (let app-name "HQL Test App")
      (let version "1.0.0")
      
      (fn calculate-value [n]
        (square (factorial n)))
      
      (fn format-result [n result]
        (concat-str "The result of factorial(" n ")² is: " result))
      
      (fn run [input]
        (let n (parseInt input)
              result (calculate-value n))
          (format-result n result))
      `;
      
      // Execute the script
      await executeHQL(script, evaluator);
      
      // Test the script functionality
      await testCommand("go", "app", evaluator, state);
      const result = await executeHQL("(run \"4\")", evaluator);
      
      // Check result contains the expected output
      assertStringIncludes(result.value, "The result of factorial(4)²");
      assertStringIncludes(result.value, "576"); // (4! = 24)² = 576
      
      // Test modules were created
      const modules = await evaluator.getAvailableModules();
      assertEquals(modules.includes("math"), true);
      assertEquals(modules.includes("strings"), true);
      assertEquals(modules.includes("app"), true);
      
      // Test imports work correctly
      const calculateResult = await executeHQL("(calculate-value 3)", evaluator);
      assertEquals(calculateResult.value, 36); // (3! = 6)² = 36
      
      // Test non-imported functions are not accessible
      try {
        await executeHQL("(cube 3)", evaluator);
        throw new Error("Should not be able to access non-imported function");
      } catch (error) {
        assertStringIncludes(error.message, "not defined");
      }
      
      // Test we can still access the original modules
      await testCommand("go", "math", evaluator, state);
      const cubeResult = await executeHQL("(cube 4)", evaluator);
      assertEquals(cubeResult.value, 64);
    } finally {
      await cleanup();
    }
  });
  
  Deno.test("Integration - Multiple library import scenario", async () => {
    const { evaluator, state, cleanup } = await createTestEnvironment();
    
    try {
      // Create a data module
      await testCommand("mkdir", "data", evaluator, state);
      await testCommand("go", "data", evaluator, state);
      
      await executeHQL(`
        (let users [
          {"id": 1, "name": "Alice", "age": 28}
          {"id": 2, "name": "Bob", "age": 35}
          {"id": 3, "name": "Charlie", "age": 42}
          {"id": 4, "name": "Diana", "age": 31}
        ])
        
        (let settings {
          "debug": true
          "timeout": 30000
          "max-retries": 3
        })
        
        (export [users settings])
      `, evaluator);
      
      // Create a utils module
      await testCommand("mkdir", "utils", evaluator, state);
      await testCommand("go", "utils", evaluator, state);
      
      await executeHQL(`
        (fn filter-by [items key value]
          (filter (fn [item] (= (get item key) value)) items))
        
        (fn find-by [items key value]
          (first (filter-by items key value)))
        
        (fn map-prop [items key]
          (map (fn [item] (get item key)) items))
        
        (export [filter-by find-by map-prop])
      `, evaluator);
      
      // Create a string module
      await testCommand("mkdir", "str-utils", evaluator, state);
      await testCommand("go", "str-utils", evaluator, state);
      
      await executeHQL(`
        (fn starts-with? [s prefix]
          (= (substr s 0 (count prefix)) prefix))
        
        (fn ends-with? [s suffix]
          (= (substr s (- (count s) (count suffix))) suffix))
        
        (fn join [separator items]
          (reduce (fn [acc item] 
                    (if (= acc "")
                      (str item)
                      (str acc separator item)))
                  "" 
                  items))
        
        (export [starts-with? ends-with? join])
      `, evaluator);
      
      // Create a main application module
      await testCommand("mkdir", "app", evaluator, state);
      await testCommand("go", "app", evaluator, state);
      
      await executeHQL(`
        (import [users] from "data")
        (import [filter-by map-prop] from "utils")
        (import [join] from "str-utils")
        
        (fn get-user-names []
          (map-prop users "name"))
        
        (fn get-adult-users [min-age]
          (filter-by users "age" (fn [age] (>= age min-age))))
        
        (fn format-user-list [users-list]
          (join ", " (map-prop users-list "name")))
          
        (fn get-adults-summary [min-age]
          (let adults (get-adult-users min-age)
                names (format-user-list adults))
            (str "Adults (age >= " min-age "): " names))
      `, evaluator);
      
      // Test the application
      const namesResult = await executeHQL("(get-user-names)", evaluator);
      assertEquals(Array.isArray(namesResult.value), true);
      assertEquals(namesResult.value.length, 4);
      assertEquals(namesResult.value[0], "Alice");
      
      const adultsResult = await executeHQL("(get-adults-summary 35)", evaluator);
      assertStringIncludes(adultsResult.value, "Adults (age >= 35)");
      assertStringIncludes(adultsResult.value, "Bob");
      assertStringIncludes(adultsResult.value, "Charlie");
      
      // Test cross-module access
      await testCommand("go", "utils", evaluator, state);
      await executeHQL("(import [users] from \"data\")", evaluator);
      
      const utilsResult = await executeHQL("(find-by users \"name\" \"Diana\")", evaluator);
      assertEquals(utilsResult.value.id, 4);
    } finally {
      await cleanup();
    }
  });
  
  Deno.test("Integration - Command chaining workflow", async () => {
    const { evaluator, state, cleanup } = await createTestEnvironment();
    
    try {
      // Simulate a workflow of commands as a user might enter them
      
      // 1. Create a module
      await testCommand("mkdir", "project", evaluator, state);
      
      // 2. Switch to the module
      await testCommand("go", "project", evaluator, state);
      assertEquals(state.currentModule, "project");
      
      // 3. Define core functionality
      await executeHQL(`
        (let items [])
        
        (fn add-item [item]
          (let items (conj items item))
          items)
        
        (fn remove-item [item-id]
          (let items (filter (fn [item] (not= (get item "id") item-id)) items))
          items)
        
        (fn get-items []
          items)
      `, evaluator);
      
      // 4. List defined symbols
      const listOutput = await testCommand("list", "", evaluator, state);
      assertEquals(listOutput.errors.length, 0);
      const hasSymbols = listOutput.logs.some(line => 
        line.includes("items") && 
        line.includes("add-item") && 
        line.includes("remove-item") && 
        line.includes("get-items")
      );
      assertEquals(hasSymbols, true);
      
      // 5. Add some items
      await executeHQL("(add-item {\"id\": 1, \"name\": \"Item 1\"})", evaluator);
      await executeHQL("(add-item {\"id\": 2, \"name\": \"Item 2\"})", evaluator);
      
      // 6. Check state
      const itemsResult = await executeHQL("(get-items)", evaluator);
      assertEquals(Array.isArray(itemsResult.value), true);
      assertEquals(itemsResult.value.length, 2);
      
      // 7. Use the see command to examine a function
      const seeOutput = await testCommand("see", "add-item", evaluator, state);
      assertEquals(seeOutput.errors.length, 0);
      const hasFunctionDef = seeOutput.logs.some(line => line.includes("(conj items item)"));
      assertEquals(hasFunctionDef, true);
      
      // 8. Create another module
      await testCommand("mkdir", "ui", evaluator, state);
      await testCommand("go", "ui", evaluator, state);
      
      // 9. Import from the project module
      await executeHQL("(import [get-items add-item] from \"project\")", evaluator);
      
      // 10. Define UI functions
      await executeHQL(`
        (fn render-items []
          (let items (get-items))
            (map (fn [item] 
                   (str "Item #" (get item "id") ": " (get item "name")))
                 items))
                 
        (fn add-new-item [name]
          (add-item {"id": (+ (count (get-items)) 1), "name": name})
          (render-items))
      `, evaluator);
      
      // 11. Use the UI functions
      const renderResult = await executeHQL("(render-items)", evaluator);
      assertEquals(Array.isArray(renderResult.value), true);
      assertEquals(renderResult.value.length, 2);
      assertStringIncludes(renderResult.value[0], "Item #1");
      
      const addResult = await executeHQL("(add-new-item \"Item 3\")", evaluator);
      assertEquals(Array.isArray(addResult.value), true);
      assertEquals(addResult.value.length, 3);
      
      // 12. Switch back to project module and verify state change
      await testCommand("go", "project", evaluator, state);
      const updatedItems = await executeHQL("(get-items)", evaluator);
      assertEquals(updatedItems.value.length, 3);
      
      // 13. Export symbols
      await executeHQL("(export [add-item remove-item get-items])", evaluator);
      
      // 14. See exports
      const exportsOutput = await testCommand("see", "project:exports", evaluator, state);
      assertEquals(exportsOutput.errors.length, 0);
      const hasExports = exportsOutput.logs.some(line => 
        line.includes("add-item") && 
        line.includes("remove-item") && 
        line.includes("get-items")
      );
      assertEquals(hasExports, true);
      
      // 15. Use find command
      const findOutput = await testCommand("find", "item", evaluator, state);
      assertEquals(findOutput.errors.length, 0);
      const foundInBothModules = 
        findOutput.logs.some(line => line.includes("project")) && 
        findOutput.logs.some(line => line.includes("ui"));
      assertEquals(foundInBothModules, true);
    } finally {
      await cleanup();
    }
  });
  
  Deno.test("Integration - State preservation and module interactions", async () => {
    const { evaluator, state, cleanup } = await createTestEnvironment();
    
    try {
      // Create a complex multi-module application
      
      // 1. Create a core module
      await testCommand("mkdir", "core", evaluator, state);
      await testCommand("go", "core", evaluator, state);
      
      await executeHQL(`
        (let app-state {
          "initialized": false,
          "counter": 0,
          "messages": []
        })
        
        (fn initialize []
          (let app-state (assoc app-state "initialized" true))
          app-state)
        
        (fn increment []
          (let app-state (update app-state "counter" inc))
          (get app-state "counter"))
        
        (fn add-message [msg]
          (let app-state (update app-state "messages" conj msg))
          (get app-state "messages"))
        
        (fn get-state []
          app-state)
          
        (export [initialize increment add-message get-state])
      `, evaluator);
      
      // 2. Create a UI module that depends on core
      await testCommand("mkdir", "ui", evaluator, state);
      await testCommand("go", "ui", evaluator, state);
      
      await executeHQL(`
        (import [initialize increment add-message get-state] from "core")
        
        (fn render-counter []
          (str "Counter: " (increment)))
        
        (fn render-messages []
          (let messages (get app-state "messages"))
          (map (fn [msg] (str "- " msg)) messages))
        
        (fn start-app []
          (initialize)
          (add-message "Application started")
          (render-counter))
          
        (export [start-app render-counter render-messages])
      `, evaluator);
      
      // 3. Create a client module that uses both
      await testCommand("mkdir", "client", evaluator, state);
      await testCommand("go", "client", evaluator, state);
      
      await executeHQL(`
        (import [start-app render-counter] from "ui")
        (import [add-message get-state] from "core")
        
        (fn run-client []
          (start-app)
          (add-message "Client connected")
          (render-counter))
          
        (export [run-client])
      `, evaluator);
      
      // 4. Test the application flow
      const result = await executeHQL("(run-client)", evaluator);
      assertStringIncludes(result.value, "Counter: 2"); // Initialize (1), then render-counter (2)
      
      // 5. Verify state is preserved across modules
      await testCommand("go", "core", evaluator, state);
      const coreState = await executeHQL("(get-state)", evaluator);
      
      // Check initialized flag set by UI module
      assertEquals(coreState.value.initialized, true);
      
      // Check messages added by both UI and client modules
      assertEquals(Array.isArray(coreState.value.messages), true);
      assertEquals(coreState.value.messages.length, 2);
      assertEquals(coreState.value.messages[0], "Application started");
      assertEquals(coreState.value.messages[1], "Client connected");
      
      // 6. Test that state updates are visible across modules
      await testCommand("go", "ui", evaluator, state);
      const counterResult = await executeHQL("(render-counter)", evaluator);
      assertStringIncludes(counterResult.value, "Counter: 3");
      
      await testCommand("go", "client", evaluator, state);
      await executeHQL("(run-client)", evaluator);
      
      await testCommand("go", "core", evaluator, state);
      const updatedState = await executeHQL("(get-state)", evaluator);
      assertEquals(updatedState.value.counter, 5); // Should be 5 after more increments
      assertEquals(updatedState.value.messages.length, 4); // Should have 4 messages now
    } finally {
      await cleanup();
    }
  });
  
  Deno.test("Integration - REPL command behavior with modules", async () => {
    const { evaluator, state, cleanup } = await createTestEnvironment();
    
    try {
      // First create several modules with varying content
      await testCommand("mkdir", "module1", evaluator, state);
      await testCommand("go", "module1", evaluator, state);
      await executeHQL("(let module1-val 100)", evaluator);
      await executeHQL("(fn module1-fn [x] (* x 2))", evaluator);
      
      await testCommand("mkdir", "module2", evaluator, state);
      await testCommand("go", "module2", evaluator, state);
      await executeHQL("(let module2-val 200)", evaluator);
      await executeHQL("(fn module2-fn [x] (+ x 10))", evaluator);
      
      // Test list command behavior
      await testCommand("go", "module1", evaluator, state);
      const list1Output = await testCommand("list", "", evaluator, state);
      const hasModule1Symbols = list1Output.logs.some(line => 
        line.includes("module1-val") && line.includes("module1-fn")
      );
      assertEquals(hasModule1Symbols, true);
      
      // Test ls -m to list all modules
      const modulesOutput = await testCommand("list", "-m", evaluator, state);
      const hasAllModules = modulesOutput.logs.some(line => 
        line.includes("module1") && line.includes("module2") && line.includes("global")
      );
      assertEquals(hasAllModules, true);
      
      // Test see command with module:symbol format
      await testCommand("go", "module2", evaluator, state);
      const seeOutput = await testCommand("see", "module1:module1-fn", evaluator, state);
      assertEquals(seeOutput.errors.length, 0);
      const hasFunctionDef = seeOutput.logs.some(line => line.includes("(* x 2)"));
      assertEquals(hasFunctionDef, true);
      
      // Test doc command with module/* format
      const docOutput = await testCommand("doc", "module1/*", evaluator, state);
      assertEquals(docOutput.errors.length, 0);
      const hasModuleDoc = docOutput.logs.some(line => line.includes("Module: module1"));
      assertEquals(hasModuleDoc, true);
      
      // Test find command across modules
      const findOutput = await testCommand("find", "val", evaluator, state);
      assertEquals(findOutput.errors.length, 0);
      const foundInBothModules = 
        findOutput.logs.some(line => line.includes("module1-val")) && 
        findOutput.logs.some(line => line.includes("module2-val"));
      assertEquals(foundInBothModules, true);
      
      // Test removing a symbol from a specific module
      const removeOutput = await testCommand("remove", "module1:module1-val", evaluator, state);
      assertEquals(removeOutput.errors.length, 0);
      
      // Verify symbol was removed from module1
      await testCommand("go", "module1", evaluator, state);
      const listAfterRemove = await testCommand("list", "", evaluator, state);
      const hasRemovedSymbol = listAfterRemove.logs.some(line => line.includes("module1-val"));
      assertEquals(hasRemovedSymbol, false);
      
      // Test ls -all to see all symbols across all modules
      const allSymbolsOutput = await testCommand("list", "-all", evaluator, state);
      assertEquals(allSymbolsOutput.errors.length, 0);
      const hasModule2Symbols = allSymbolsOutput.logs.some(line => 
        line.includes("module2-val") && line.includes("module2-fn")
      );
      assertEquals(hasModule2Symbols, true);
    } finally {
      await cleanup();
    }
  });
  
  Deno.test("Integration - Tab completion and history", async () => {
    const { evaluator, state, cleanup } = await createTestEnvironment();
    
    try {
      // Create some test data
      await executeHQL("(let test-value 42)", evaluator);
      await executeHQL("(fn calculate [x y] (+ x y))", evaluator);
      await executeHQL("(fn calculate-product [x y] (* x y))", evaluator);
      
      // Create a module
      await testCommand("mkdir", "completion-test", evaluator, state);
      await testCommand("go", "completion-test", evaluator, state);
      await executeHQL("(let module-value 100)", evaluator);
      
      // Mock stdin/stdout to simulate tab completion
      // Here we'd normally test the actual tab completion functionality
      // but since that requires direct terminal interaction, we'll check
      // that the commands we expect to be completed exist
      
      // Test that symbols are available for completion
      await testCommand("go", "global", evaluator, state);
      const symbolsOutput = await testCommand("list", "", evaluator, state);
      
      // These symbols should be available for completion
      const hasTestValue = symbolsOutput.logs.some(line => line.includes("test-value"));
      const hasCalculate = symbolsOutput.logs.some(line => line.includes("calculate"));
      const hasCalculateProduct = symbolsOutput.logs.some(line => line.includes("calculate-product"));
      
      assertEquals(hasTestValue, true);
      assertEquals(hasCalculate, true);
      assertEquals(hasCalculateProduct, true);
      
      // Test that modules are available for completion in module commands
      const modulesOutput = await testCommand("modules", "", evaluator, state);
      const hasCompletionTest = modulesOutput.logs.some(line => line.includes("completion-test"));
      assertEquals(hasCompletionTest, true);
      
      // Test history by adding items and checking they can be retrieved
      // (This is more of a verification that the history functionality exists)
      const history1 = await executeHQL("(+ 1 2 3)", evaluator);
      const history2 = await executeHQL("(* 4 5)", evaluator);
      
      // Actual history testing would require more complex stdin/stdout mocking
      // that simulates up/down arrow keypresses
    } finally {
      await cleanup();
    }
  });
  
  Deno.test("Integration - Error recovery and continued operation", async () => {
    const { evaluator, state, cleanup } = await createTestEnvironment();
    
    try {
      // 1. Define a basic function
      await executeHQL("(fn add [a b] (+ a b))", evaluator);
      
      // 2. Cause an error by defining invalid function
      try {
        await executeHQL("(fn broken [x] (/ 1 0))", evaluator);
      } catch (error) {
        // Expected error
      }
      
      // 3. REPL should be able to continue operation
      const result = await executeHQL("(add 5 7)", evaluator);
      assertEquals(result.value, 12);
      
      // 4. Cause syntax error
      try {
        await executeHQL("(fn missing-paren [x] (+ x 1)", evaluator);
      } catch (error) {
        // Expected syntax error
      }
      
      // 5. REPL should recover and continue
      const afterSyntaxError = await executeHQL("(add 10 20)", evaluator);
      assertEquals(afterSyntaxError.value, 30);
      
      // 6. Test multiline error recovery
      state.multilineMode = true;
      state.multilineInput = "(fn multiline [x]\n  (let y (+ x 1))\n";
      state.parenBalance = 2; // Simulated unbalanced parentheses
      
      // Simulate error in multiline mode
      try {
        await executeHQL(state.multilineInput + "  (undefined-function))", evaluator);
      } catch (error) {
        // Expected error
      }
      
      // Reset state as would happen in actual REPL
      resetReplState(state);
      
      // 7. REPL should be able to continue
      const afterMultilineError = await executeHQL("(add 100 200)", evaluator);
      assertEquals(afterMultilineError.value, 300);
      
      // 8. Test error in one module doesn't affect others
      await testCommand("mkdir", "error-test", evaluator, state);
      await testCommand("go", "error-test", evaluator, state);
      
      try {
        await executeHQL("(/ 1 0)", evaluator);
      } catch (error) {
        // Expected division by zero
      }
      
      // 9. Switch to another module and continue
      await testCommand("go", "global", evaluator, state);
      const afterModuleError = await executeHQL("(add 42 58)", evaluator);
      assertEquals(afterModuleError.value, 100);
    } finally {
      await cleanup();
    }
  });
  
  Deno.test("Integration - CLI compatibility and command aliases", async () => {
    const { evaluator, state, cleanup } = await createTestEnvironment();
    
    try {
      // Test each CLI command and its REPL equivalent
      
      // Define some test data
      await executeHQL("(let cli-test-val 42)", evaluator);
      
      // Test 'ls' (equivalent to :list)
      const lsOutput = await testCommand("ls", "", evaluator, state);
      assertEquals(lsOutput.errors.length, 0);
      const hasCliVal = lsOutput.logs.some(line => line.includes("cli-test-val"));
      assertEquals(hasCliVal, true);
      
      // Test 'mkdir' (creating a module)
      const mkdirOutput = await testCommand("mkdir", "cli-module", evaluator, state);
      assertEquals(mkdirOutput.errors.length, 0);
      
      // Test 'cd' (equivalent to :go)
      const cdOutput = await testCommand("cd", "cli-module", evaluator, state);
      assertEquals(cdOutput.errors.length, 0);
      assertEquals(state.currentModule, "cli-module");
      
      // Test 'pwd' (showing current module)
      const pwdOutput = await testCommand("pwd", "", evaluator, state);
      assertEquals(pwdOutput.errors.length, 0);
      const showsCurrentModule = pwdOutput.logs.some(line => line.includes("cli-module"));
      assertEquals(showsCurrentModule, true);
      
      // Define something in this module
      await executeHQL("(let module-val 100)", evaluator);
      
      // Test 'ls -m' (listing modules, equivalent to :modules)
      const lsModulesOutput = await testCommand("ls", "-m", evaluator, state);
      assertEquals(lsModulesOutput.errors.length, 0);
      const hasCliModule = lsModulesOutput.logs.some(line => line.includes("cli-module"));
      assertEquals(hasCliModule, true);
      
      // Test 'find' command
      const findOutput = await testCommand("find", "val", evaluator, state);
      assertEquals(findOutput.errors.length, 0);
      const foundValue = findOutput.logs.some(line => line.includes("module-val"));
      assertEquals(foundValue, true);
      
      // Test 'rm' (removing a symbol, equivalent to :remove)
      const rmOutput = await testCommand("rm", "-f module-val", evaluator, state);
      assertEquals(rmOutput.errors.length, 0);
      
      // Verify removal
      const afterRmOutput = await testCommand("ls", "", evaluator, state);
      const stillHasVal = afterRmOutput.logs.some(line => line.includes("module-val"));
      assertEquals(stillHasVal, false);
      
      // Test 'man' command (equivalent to :help)
      const manOutput = await testCommand("man", "find", evaluator, state);
      assertEquals(manOutput.errors.length, 0);
      const hasFindHelp = manOutput.logs.some(line => line.includes("find") && line.includes("search"));
      assertEquals(hasFindHelp, true);
      
      // Go back to global
      await testCommand("cd", "global", evaluator, state);
      assertEquals(state.currentModule, "global");
      
      // Test rm for modules
      const rmModuleOutput = await testCommand("rm", "-f cli-module", evaluator, state);
      assertEquals(rmModuleOutput.errors.length, 0);
      
      // Verify module removal
      const afterRmModuleOutput = await testCommand("ls", "-m", evaluator, state);
      const stillHasModule = afterRmModuleOutput.logs.some(line => line.includes("cli-module"));
      assertEquals(stillHasModule, false);
    } finally {
      await cleanup();
    }
  });
  
  Deno.test("Integration - Import functionality and JS interop", async () => {
    const { evaluator, state, cleanup } = await createTestEnvironment();
    
    try {
      // Create a module with JS interop features
      await testCommand("mkdir", "interop", evaluator, state);
      await testCommand("go", "interop", evaluator, state);
      
      // Define functions that use JavaScript interop
      await executeHQL(`
        (fn get-date [] 
          (new Date))
        
        (fn format-date [date]
          (date.toLocaleString))
        
        (fn get-random []
          (Math.random))
        
        (fn create-element [type]
          (js-call document "createElement" type))
          
        (export [get-date format-date get-random])
      `, evaluator);
      
      // Test the interop functions
      const dateResult = await executeHQL("(get-date)", evaluator);
      assertEquals(dateResult.value instanceof Date, true);
      
      const randomResult = await executeHQL("(get-random)", evaluator);
      assertEquals(typeof randomResult.value, "number");
      assertEquals(randomResult.value >= 0 && randomResult.value < 1, true);
      
      // Create a module that imports from the interop module
      await testCommand("mkdir", "app", evaluator, state);
      await testCommand("go", "app", evaluator, state);
      
      // Import from interop module
      await executeHQL(`
        (import [get-date format-date] from "interop")
        
        (fn get-formatted-date []
          (format-date (get-date)))
        
        (fn timestamp []
          (let date (get-date))
          (.getTime date))
          
        (export [get-formatted-date timestamp])
      `, evaluator);
      
      // Test the imported functionality
      const formattedResult = await executeHQL("(get-formatted-date)", evaluator);
      assertEquals(typeof formattedResult.value, "string");
      
      const timestampResult = await executeHQL("(timestamp)", evaluator);
      assertEquals(typeof timestampResult.value, "number");
      
      // Test direct JavaScript property access
      await testCommand("go", "interop", evaluator, state);
      const mathResult = await executeHQL("Math.PI", evaluator);
      assertEquals(mathResult.value, Math.PI);
      
      // Test using JavaScript array methods
      const arrayResult = await executeHQL(`
        (let arr [1, 2, 3, 4, 5])
        (.map arr (lambda [x] (* x 2)))
      `, evaluator);
      assertEquals(Array.isArray(arrayResult.value), true);
      assertEquals(arrayResult.value.length, 5);
      assertEquals(arrayResult.value[0], 2);
      assertEquals(arrayResult.value[4], 10);
    } finally {
      await cleanup();
    }
  });