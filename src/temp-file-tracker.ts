import { Logger } from "./logger.ts";

const tempFilesRegistry = new Set<string>();
const exceptionFilesRegistry = new Set<string>();

export function registerTempFile(path: string): void {
  const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");
  tempFilesRegistry.add(path);
  logger.debug(`Registered temporary file >>: ${path}`);
}

export function registerExceptionTempFile(path: string): void {
  const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");
  exceptionFilesRegistry.add(path);
  logger.debug(`Registered exception temporary file >>: ${path}`);
}

export async function cleanupAllTempFiles(): Promise<void> {
  const logger = new Logger(Deno.env.get("HQL_DEBUG") === "1");
  // Determine only the paths that should be removed
  const targets = Array.from(tempFilesRegistry).filter(
    (file) => !exceptionFilesRegistry.has(file),
  );

  logger.debug("yo removal targets:", targets);
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
  tempFilesRegistry.clear();
  logger.debug("Temporary file registry cleared");
}
