import { Logger } from "../logger.ts";
import { getLogger, isDebugMode } from "../logger-init.ts";

// Create a single logger instance for all functions in this file
const logger = getLogger({ verbose: isDebugMode() });

// All temp files to track
const tempFiles: Set<string> = new Set();

// Temp files to not clean up (exceptions, specified by user)
const exceptionTempFiles: Set<string> = new Set();

export function registerTempFile(path: string): void {
  tempFiles.add(path);
  logger.debug(`Registered temporary file >>: ${path}`);
}

export function registerExceptionTempFile(path: string): void {
  exceptionTempFiles.add(path);
  logger.debug(`Registered exception temporary file >>: ${path}`);
}

export async function cleanupAllTempFiles(): Promise<void> {
  // Determine only the paths that should be removed
  const targets = Array.from(tempFiles).filter(
    (file) => !exceptionTempFiles.has(file),
  );

  logger.debug(`Removal targets: ${targets.join(", ")}`);
  logger.debug(`Cleaning up ${targets.length} registered temporary files`);

  const removalPromises = targets.map(async (file) => {
    try {
      await Deno.remove(file);
      logger.debug(`Removed temporary file: ${file}`);
    } catch (e) {
      logger.debug(
        `Failed to remove temporary file ${file}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  });

  await Promise.all(removalPromises);

  // Clear the registry after processing
  tempFiles.clear();
  logger.debug("Temporary file registry cleared");
}
