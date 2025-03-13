// run_parallel_tests.ts
// Improved script to run tests in parallel with better visibility

const testCommands = [
    "deno test --allow-all test/macro/quote_test.ts",
    "deno test --allow-all test/macro/quasiquote_test.ts",
    "deno test --allow-all test/macro/do_test.ts",
    "deno test --allow-all test/macro/and_test.ts",
    "deno test --allow-all test/macro/or_test.ts",
    "deno test --allow-all test/macro/not_test.ts",
    "deno test --allow-all test/macro/defn_test.ts",
    "deno test --allow-all test/macro/cond_test.ts",
    "deno test --allow-all test/macro/let_test.ts",
    "deno test --allow-all test/macro/comparison_operators_test.ts",
    "deno test --allow-all test/macro/daily_macro_test.ts",
    "deno test --allow-all test/data_structures/empty_literals_test.ts",
    "deno test --allow-all test/data_structures/normal_literals_test.ts",
    "deno test --allow-all test/import/export_test.ts",
    "deno test --allow-all test/import/remote_import_test.ts",
    "deno task test-hql-spec"
  ];
  
  interface TestResult {
    command: string;
    success: boolean;
    duration: number;
    error?: any;
  }
  
  async function runTest(cmdString: string): Promise<TestResult> {
    const startTime = performance.now();
    
    console.log(`➡️ Starting: ${cmdString}`);
    
    try {
      const args = cmdString.split(" ");
      
      // Capture output instead of inheriting to avoid interleaved logs
      const p = Deno.run({
        cmd: args,
        stdout: "piped",
        stderr: "piped",
      });
      
      const status = await p.status();
      
      // Read stdout and stderr
      const output = await p.output();
      const errOutput = await p.stderrOutput();
      p.close();
      
      const endTime = performance.now();
      const duration = (endTime - startTime) / 1000;
      
      const success = status.success;
      
      // Only print detailed output on failure to avoid cluttered console
      if (!success) {
        console.error(`❌ FAILED: ${cmdString}`);
        console.error(`Stdout: ${new TextDecoder().decode(output)}`);
        console.error(`Stderr: ${new TextDecoder().decode(errOutput)}`);
      } else {
        console.log(`✅ PASSED: ${cmdString} (${duration.toFixed(2)}s)`);
      }
      
      return {
        command: cmdString,
        success,
        duration
      };
    } catch (error) {
      const endTime = performance.now();
      const duration = (endTime - startTime) / 1000;
      
      console.error(`❌ ERROR: ${cmdString}`);
      console.error(error);
      
      return {
        command: cmdString,
        success: false,
        duration,
        error
      };
    }
  }
  
  // Run tests in parallel
  async function runInParallel(): Promise<TestResult[]> {
    return Promise.all(testCommands.map(runTest));
  }
  
  async function main() {
    console.log(`Running ${testCommands.length} tests in parallel mode...\n`);
    
    const startTime = performance.now();
    const results = await runInParallel()
    const endTime = performance.now();
    
    const totalDuration = (endTime - startTime) / 1000;
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    
    console.log("\n==== Test Summary ====");
    console.log(`Total tests: ${results.length}`);
    console.log(`Passed: ${successCount}`);
    console.log(`Failed: ${failureCount}`);
    console.log(`Total duration: ${totalDuration.toFixed(2)} seconds`);
    
    if (failureCount > 0) {
      console.log("\nFailed tests:");
      results
        .filter(r => !r.success)
        .forEach(result => {
          console.log(`- ${result.command}`);
        });
        
      Deno.exit(1);
    }
    
    Deno.exit(0);
  }
  
  main();