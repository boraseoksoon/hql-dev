// test/repl/run-tests.ts
// Main test runner for REPL unit tests

import { colors } from "../../src/repl/repl-ui.ts";
import { join, fromFileUrl, dirname } from "https://deno.land/std@0.224.0/path/mod.ts";

// Get current directory for absolute path resolution
const currentDir = dirname(fromFileUrl(import.meta.url));

// Define test categories with their file paths (using absolute paths)
const TEST_CATEGORIES = {
  core: join(currentDir, "repl-core-test.ts"),
  command: join(currentDir, "repl-command-test.ts"),
  module: join(currentDir, "repl-module-test.ts"),
  error: join(currentDir, "repl-error-test.ts"),
  persistence: join(currentDir, "repl-persistence-test.ts"),
  input: join(currentDir, "repl-input-test.ts"),
  integration: join(currentDir, "repl-integration-test.ts")
};

// Parse command line arguments
const args = Deno.args;
const verbose = args.includes("--verbose") || args.includes("-v");
const categories = args.filter(arg => !arg.startsWith("-") && arg !== "all");
const filter = args.find(arg => arg.startsWith("--filter="))?.split("=")[1] || "";

// Helper to print colored test info
function printInfo(message: string, color: string): void {
  console.log(`${color}${message}${colors.reset}`);
}

// Helper to run tests for a specific category
async function runTestCategory(category: string, path: string): Promise<boolean> {
  printInfo(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, colors.fg.blue);
  printInfo(`Running ${category.toUpperCase()} tests`, colors.bright + colors.fg.blue);
  printInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`, colors.fg.blue);
  
  try {
    // Check if the test file exists
    try {
      await Deno.stat(path);
    } catch (error) {
      printInfo(`❌ Test file not found: ${path}`, colors.fg.red);
      return false;
    }
    
    // Add filter if provided
    const filterArgs = filter ? [`--filter=${filter}`] : [];
    
    // Build the command with permissions split into separate arguments
    // Add --no-check to skip TypeScript type checking
    const cmd = [
      "--no-check",
      "--allow-read",
      "--allow-write",
      "--allow-net",
      "--allow-env",
      path,
      ...filterArgs
    ];
    
    // Run the tests using Deno.Command (new API replacing Deno.run)
    const command = new Deno.Command(Deno.execPath(), {
      args: ["test", ...cmd],
      stdout: "piped",
      stderr: "piped"
    });
    
    const { stdout, stderr, success } = await command.output();
    
    // Print output if verbose or if there was an error
    if (verbose || !success) {
      const output = new TextDecoder().decode(stdout);
      const errors = new TextDecoder().decode(stderr);
      
      if (output) console.log(output);
      if (errors) console.error(errors);
    }
    
    if (success) {
      printInfo(`✅ ${category.toUpperCase()} tests passed\n`, colors.fg.green);
      return true;
    } else {
      printInfo(`❌ ${category.toUpperCase()} tests failed\n`, colors.fg.red);
      return false;
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      printInfo(`❌ Error running ${category} tests: ${error.message}`, colors.fg.red);
    } else {
      printInfo(`❌ Error running ${category} tests: ${String(error)}`, colors.fg.red);
    }
    return false;
  }
}

// Main function to run the tests
async function runTests() {
  printInfo(`
╔════════════════════════════════════════════════════════╗
║                  REPL TEST SUITE RUNNER                ║
╚════════════════════════════════════════════════════════╝
`, colors.fg.yellow + colors.bright);
  
  printInfo(`Mode: ${verbose ? "Verbose" : "Normal"}`, colors.fg.cyan);
  if (filter) {
    printInfo(`Filter: ${filter}`, colors.fg.cyan);
  }
  
  const categoriesToRun = categories.length > 0 && !categories.includes("all") 
    ? categories 
    : Object.keys(TEST_CATEGORIES);
  
  printInfo(`Running test categories: ${categoriesToRun.join(", ")}`, colors.fg.cyan);
  
  let passed = 0;
  let failed = 0;
  
  // Run tests for each selected category
  for (const category of categoriesToRun) {
    if (!(category in TEST_CATEGORIES)) {
      printInfo(`⚠️ Unknown test category: ${category}`, colors.fg.yellow);
      continue;
    }
    
    const success = await runTestCategory(category, TEST_CATEGORIES[category as keyof typeof TEST_CATEGORIES]);
    if (success) {
      passed++;
    } else {
      failed++;
    }
  }
  
  // Print final summary
  printInfo(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, colors.fg.magenta);
  printInfo(`TEST SUMMARY`, colors.bright + colors.fg.magenta);
  printInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, colors.fg.magenta);
  printInfo(`Total categories: ${categoriesToRun.length}`, colors.fg.white);
  printInfo(`Passed: ${passed}`, colors.fg.green);
  printInfo(`Failed: ${failed}`, colors.fg.red);
  printInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`, colors.fg.magenta);
  
  // Exit with appropriate code
  if (failed > 0) {
    Deno.exit(1);
  }
}

// Run the tests
runTests();