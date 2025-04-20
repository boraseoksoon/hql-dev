import { TranspilerError, report } from "./transpiler/error/errors.ts";
import { ErrorPipeline } from "./common/error-pipeline.ts";

// Replace any report() calls with ErrorPipeline.reportError()
try {
  // ... existing code ...
} catch (error) {
  ErrorPipeline.reportError(error, {
    verbose: true,
    showCallStack: true
  });
  Deno.exit(1);
}
// ... existing code ... 