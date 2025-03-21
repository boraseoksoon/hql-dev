// parallel_test.ts
// This script runs each candidate test command in parallel

const testCommands = [
  "deno run -A ./cli/run.ts ./examples/macro.hql",
  "deno task bug-test",
  "deno run -A ./cli/run.ts ./examples/dependency-test/macro-a.hql",
  "deno task test-hql-spec",
  "deno run -A ./cli/run.ts ./examples/import/simple2/b.hql",
  "deno run -A ./cli/run.ts ./examples/import/simple/b.hql",
  "deno run -A ./cli/run.ts ./examples/import/module2.hql"
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
    // Splitting the command string into arguments.
    // Note: This simple approach assumes no spaces within arguments.
    const args = cmdString.split(" ");
    
    const process = Deno.run({
      cmd: args,
      stdout: "piped",
      stderr: "piped",
    });
    
    const status = await process.status();
    const output = await process.output();
    const errOutput = await process.stderrOutput();
    process.close();
    
    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000;
    const success = status.success;
    
    if (!success) {
      console.error(`❌ FAILED: ${cmdString}`);
      console.error(`Stdout: ${new TextDecoder().decode(output)}`);
      console.error(`Stderr: ${new TextDecoder().decode(errOutput)}`);
    } else {
      console.log(`✅ PASSED: ${cmdString} (${duration.toFixed(2)}s)`);
    }
    
    return { command: cmdString, success, duration };
  } catch (error) {
    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000;
    console.error(`❌ ERROR: ${cmdString}`);
    console.error(error);
    return { command: cmdString, success: false, duration, error };
  }
}

async function runInParallel(): Promise<TestResult[]> {
  return Promise.all(testCommands.map(runTest));
}

async function main() {
  console.log(`Running ${testCommands.length} tests in parallel...\n`);
  
  const startTime = performance.now();
  const results = await runInParallel();
  const endTime = performance.now();
  
  const totalDuration = (endTime - startTime) / 1000;
  
  console.log("\n==== Test Summary ====");
  results.forEach(result => {
    console.log(`${result.success ? "✅" : "❌"} ${result.command} - ${result.duration.toFixed(2)}s`);
  });
  console.log(`Total duration: ${totalDuration.toFixed(2)} seconds`);
  
  if (results.some(r => !r.success)) {
    Deno.exit(1);
  } else {
    Deno.exit(0);
  }
}

main();
