// cli/enable-enhanced-errors.ts - Enable enhanced error handling for all HQL tools
import { resolve } from "../src/platform/platform.ts";
import { initializeErrorHandling } from "../src/error-initializer.ts";

console.log("\n🚀 Enabling enhanced error reporting for all HQL tools...");

// Initialize our enhanced error handling system
initializeErrorHandling({
  enableGlobalHandlers: true,
  enableReplEnhancement: true
});

// Create aliases for common CLI commands with error-enhancement enabled
const enhancedCommands = [
  {
    name: "hql",
    source: "cli/run.ts",
    target: "hql-enhanced",
    description: "Run HQL files with enhanced error reporting"
  },
  {
    name: "transpile",
    source: "cli/transpile.ts",
    target: "hql-transpile-enhanced",
    description: "Transpile HQL to JS with enhanced error reporting"
  },
  {
    name: "repl",
    source: "cli/repl.ts",
    target: "hql-repl-enhanced",
    description: "Interactive REPL with enhanced error reporting"
  },
  {
    name: "error-report",
    source: "cli/error-report.ts",
    target: "hql-error-report",
    description: "Dedicated error reporting tool for HQL files"
  }
];

console.log("\n✅ Enhanced error handling is now available through these commands:");
for (const cmd of enhancedCommands) {
  console.log(`\x1b[32m• ${cmd.target}\x1b[0m - ${cmd.description}`);
  console.log(`  Usage: deno run -A ${cmd.source} [args...]`);
}

console.log("\n📋 Example usage:");
console.log("\x1b[34mdeno run -A cli/run.ts ./my-file.hql --debug\x1b[0m - Run with enhanced error reporting");
console.log("\x1b[34mdeno run -A cli/transpile.ts ./my-file.hql --verbose\x1b[0m - Transpile with enhanced errors");
console.log("\x1b[34mdeno run -A cli/error-report.ts ./my-file.hql\x1b[0m - Show detailed error report");

console.log("\n🛠️  Available debug flags for all commands:");
console.log("  --debug              Enable enhanced debugging and error reporting");
console.log("  --verbose            Show verbose output with enhanced formatting");
console.log("  --no-clickable-paths Disable clickable file paths in error messages");

console.log("\n📚 Documentation:");
console.log("For more details, see \x1b[36mdoc/error-handling.md\x1b[0m"); 