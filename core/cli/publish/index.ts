// cli/publish/publish.ts - HQL module publishing to NPM and JSR
import { parseArgs } from "jsr:@std/cli@1.0.13/parse-args";
import { 
  cwd, 
  exit, 
  join,
  exists 
} from "../../src/platform/platform.ts";
import { publishNpm } from "./publish_npm.ts";
import { publishJSR } from "./publish_jsr.ts";
import { checkEnvironment } from "./publish_common.ts";
import { report } from "../../src/common/error-pipeline.ts";
import { globalLogger as logger } from "../../src/logger.ts";

export interface PublishOptions {
  platform: "jsr" | "npm";
  what: string;
  entryPoint?: string;
  name?: string;
  version?: string;
  verbose?: boolean;
  dryRun?: boolean;
}

/** Show help information */
function showHelp() {
  console.log(`
HQL Publish Tool - Publish HQL modules to NPM or JSR

USAGE:
  hql publish <what> [platform] [name] [version]

EXAMPLES:
  # Publish to JSR (default) with auto name/version:
  hql publish ./my-module

  # Publish to NPM:
  hql publish ./my-module npm

  # Publish to JSR with explicit name and version:
  hql publish ./my-module jsr my-awesome-package 1.2.3

  # Dry run with verbose logging:
  hql publish ./my-module --dry-run --verbose

OPTIONS:
  -p, --platform <platform>   Target platform: 'npm' or 'jsr' (defaults to 'jsr')
  -n, --name <name>           Package name (defaults to auto-generated)
  -v, --version <version>     Package version (defaults to auto-increment or prompt)
  --dry-run                   Test the publishing process without actually publishing
  --verbose                   Enable verbose logging
  -h, --help                  Show this help message
`);
}

/**
 * Parse command-line arguments to produce a PublishOptions object.
 * Ordering:
 *   pos[0] => what (path)
 *   pos[1] => platform ("jsr" or "npm")
 *   pos[2] => name
 *   pos[3] => version
 * Flags (--platform, --name, --version) override positional values.
 */
function parsePublishArgs(args: string[]): PublishOptions {
  const parsed = parseArgs(args, {
    string: ["platform", "name", "version"],
    boolean: ["verbose", "help", "dry-run"],
    alias: {
      p: "platform",
      n: "name",
      v: "version",
      h: "help",
    },
  });

  if (parsed.help) {
    showHelp();
    exit(0);
  }

  let platform: "jsr" | "npm" = "jsr";
  if (parsed.platform) {
    const p = String(parsed.platform).toLowerCase();
    if (p === "npm" || p === "jsr") {
      platform = p as "jsr" | "npm";
    } else {
      console.error(
        `\n❌ Invalid value for --platform: "${parsed.platform}". Must be 'npm' or 'jsr'.`,
      );
      exit(1);
    }
  }

  const pos = parsed._;
  let what = pos.length > 0 ? String(pos[0]) : cwd();
  if (!what) what = cwd();

  // Only check pos[1] as platform if it's "npm" or "jsr"
  if (!parsed.platform && pos.length > 1) {
    const maybePlatform = String(pos[1]).toLowerCase();
    if (maybePlatform === "npm" || maybePlatform === "jsr") {
      platform = maybePlatform as "jsr" | "npm";
    } else {
      // If it's not a valid platform, assume it's a name and use default platform (jsr)
      console.log(`\nℹ️ Using default platform: "jsr"`);
    }
  }
  
  // Always default to JSR if no platform specified
  if (!parsed.platform && !(pos.length > 1 && (String(pos[1]).toLowerCase() === "npm" || String(pos[1]).toLowerCase() === "jsr"))) {
    console.log(`\nℹ️ Using default platform: "jsr"`);
  }

  let name: string | undefined = parsed.name;
  let version: string | undefined = parsed.version;
  if (!name && pos.length > 2) {
    name = String(pos[2]);
  }
  if (!version && pos.length > 3) {
    version = String(pos[3]);
  }

  if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`\n❌ Invalid version format: ${version}. Expected "X.Y.Z"`);
    exit(1);
  }

  return {
    platform,
    what,
    name,
    version,
    verbose: !!parsed.verbose,
    dryRun: !!parsed["dry-run"],
  };
}

/**
 * Detect entry point file from a directory or file path
 */
async function resolveEntryPoint(path: string): Promise<string> {
  // If path is a file, use it directly
  try {
    const stat = await Deno.stat(path);
    if (stat.isFile) {
      return path;
    }
  } catch (error) {
    console.error(
      `\n❌ Error accessing path "${path}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    exit(1);
  }

  // Check for index files in standard locations
  const candidates = [
    join(path, "index.hql"),
    join(path, "index.js"),
    join(path, "index.ts"),
    join(path, "main.hql"),
    join(path, "main.js"),
    join(path, "main.ts"),
  ];

  // Add directory name matching file
  const dirName = path.split("/").pop() || "";
  if (dirName) {
    candidates.push(
      join(path, `${dirName}.hql`),
      join(path, `${dirName}.js`),
      join(path, `${dirName}.ts`),
    );
  }

  // Look for any candidate file
  for (const candidate of candidates) {
    try {
      if (await exists(candidate)) {
        logger.debug(`Found entry point: ${candidate}`);
        return candidate;
      }
    } catch (_) {
      // Ignore errors checking individual files
    }
  }

  // Look for any single .hql file
  try {
    const entries = [];
    for await (const entry of Deno.readDir(path)) {
      if (entry.isFile && (
        entry.name.endsWith(".hql") ||
        entry.name.endsWith(".js") ||
        entry.name.endsWith(".ts")
      )) {
        entries.push(entry.name);
      }
    }

    if (entries.length === 1) {
      const entryPoint = join(path, entries[0]);
      logger.debug(`Using single file as entry point: ${entryPoint}`);
      return entryPoint;
    } else if (entries.length > 1) {
      console.error(
        `\n❌ Multiple potential entry points found. Please specify an entry file directly.`,
      );
    } else {
      console.error(
        `\n❌ No HQL, JS, or TS files found in "${path}".`,
      );
    }
  } catch (error) {
    console.error(
      `\n❌ Error reading directory "${path}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // If we reach here, no entry point was found
  console.error(
    `\n❌ Could not determine entry point. Please specify a file directly.`,
  );
  exit(1);
  // This line is never reached due to exit(1) above, but satisfies TypeScript
  return path;
}

/** Main publish function that calls the appropriate publisher. */
export async function publish(args: string[]): Promise<void> {
  const options = parsePublishArgs(args);

  if (options.verbose) {
    // Enable verbose logging
    logger.debug("Running with verbose logging enabled");
  }

  // Resolve the entry point file
  const entryPoint = await resolveEntryPoint(options.what);
  
  console.log(`Publishing ${options.platform.toUpperCase()} package:
  Entry point: "${entryPoint}"
  Package name: ${options.name ?? "(auto-generated)"}
  Version: ${options.version ?? "(auto-incremented)"}
  Mode: ${options.dryRun ? "Dry run (no actual publishing)" : "Live publish"}`);

  // Check environment before proceeding
  if (!await checkEnvironment(options.platform)) {
    console.error(
      "\n❌ Environment check failed. Please fix the issues before publishing.",
    );
    exit(1);
  }

  try {
    if (options.platform === "npm") {
      await publishNpm({
        ...options,
        what: entryPoint,
      });
    } else {
      await publishJSR({
        ...options,
        what: entryPoint,
      });
    }
    console.log("\n✅ Publishing process completed successfully!");
  } catch (error) {
    // Enhanced error handling
    const enhancedError = report(error, {
      filePath: entryPoint,
      useColors: true
    });
    console.error(
      "\n❌ Publishing failed:",
      enhancedError.message
    );
    throw enhancedError; // Rethrow for upstream handling
  }
}

if (import.meta.main) {
  publish(Deno.args).catch((err) => {
    // Enhanced error reporting
    const enhancedError = report(err, {
      filePath: "publish.ts",
      useColors: true
    });
    console.error(
      "\n❌ Publish failed:",
      enhancedError.message
    );
    exit(1);
  });
}
