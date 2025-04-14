// Simple binary for HQL expression evaluation
import { evaluateExpression } from "../cli/simple-eval.ts";

// Main function
function main() {
  const args = Deno.args;
  
  if (args.length !== 1) {
    console.error("Usage: hql-expr \"(+ 1 1)\"");
    Deno.exit(1);
  }
  
  try {
    const result = evaluateExpression(args[0]);
    console.log(result);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error evaluating expression: ${errorMessage}`);
    Deno.exit(1);
  }
}

// Run the main function if this is the main module
if (import.meta.main) {
  main();
} 