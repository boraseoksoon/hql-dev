// cli/test-error.ts - Simple test for error reporting
import { resolve } from "../src/platform/platform.ts";
import { Logger } from "../src/logger.ts";
import { initializeErrorHandling } from "../src/error-initializer.ts";
import { registerSourceFile, formatError, getSuggestion } from "../src/error-handling.ts";
import { processHql } from "../src/transpiler/hql-transpiler.ts";

// Run a test with a known syntax error
async function testErrorReporting(filePath: string) {
  console.log(`⚡ Testing error handling on file: ${filePath}`);
  
  // Initialize our enhanced error handling system
  initializeErrorHandling({
    enableGlobalHandlers: true,
    enableReplEnhancement: false
  });
  
  try {
    // Read the input file
    const source = await Deno.readTextFile(filePath);
    
    // Register source for error context
    registerSourceFile(filePath, source);
    
    // Try to process it, will fail with error
    await processHql(source, {
      baseDir: filePath,
      verbose: true
    });
    
    console.log("✅ No errors (unexpected)");
  } catch (error) {
    if (error instanceof Error) {
      console.log(`\n❌ Error detected: ${error.message}`);
      
      // Format with our enhanced error reporting
      const formattedError = formatError(error, {
        filePath: filePath,
        useColors: true,
        includeStack: false
      });
      
      // Add a helpful suggestion
      const suggestion = getSuggestion(error);
      
      console.log("\n===== FORMATTED ERROR =====");
      console.log(formattedError);
      console.log("\n===== SUGGESTION =====");
      console.log(suggestion);
      console.log("==========================\n");
    } else {
      console.error(`❌ Non-Error error: ${String(error)}`);
    }
  }
}

// Run the main test
if (import.meta.main) {
  if (Deno.args.length < 1) {
    console.error("Usage: deno run -A cli/test-error.ts <file-with-error.hql>");
    Deno.exit(1);
  }
  
  const inputPath = resolve(Deno.args[0]);
  await testErrorReporting(inputPath);
} 