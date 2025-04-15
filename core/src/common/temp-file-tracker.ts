import { globalLogger as logger } from "../logger.ts";

const tempFilesRegistry = new Set<string>();
const exceptionFilesRegistry = new Set<string>();

export function registerTempFile(path: string): void {
  tempFilesRegistry.add(path);
  logger.debug(`Registered temporary file >>: ${path}`);
}

export function registerExceptionTempFile(path: string): void {
  exceptionFilesRegistry.add(path);
  logger.debug(`Registered exception temporary file >>: ${path}`);
}

export async function cleanupAllTempFiles(): Promise<void> {
  // Determine only the paths that should be removed
  const targets = Array.from(tempFilesRegistry).filter(
    (file) => !exceptionFilesRegistry.has(file),
  );

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
  tempFilesRegistry.clear();
  logger.debug("Temporary file registry cleared");
}
