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
import { printPublishSummary, PublishSummary } from "./publish_summary.ts";
import { reportError } from "../../src/common/error.ts";
import { globalLogger as logger } from "../../src/logger.ts";
import { checkEnvironment } from "./publish_common.ts";

export interface PublishOptions {
  what: string;
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
  hql publish <what> [name] [version]

EXAMPLES:
  # Publish to JSR (default) with auto name/version:
  hql publish ./my-module

  # Publish to NPM:
  hql publish ./my-module npm

  # Dry run with verbose logging:
  hql publish ./my-module --dry-run --verbose

OPTIONS:
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
 *   pos[1] => name
 *   pos[2] => version
 * Only --name and --version flags override positional values.
 */
function parsePublishArgs(args: string[]): PublishOptions {
  // Detect --all flag
  const isAll = args.includes('--all') || args.includes('-a');
  // Remove --all/-a from args for further parsing
  const filteredArgs = args.filter(arg => arg !== '--all' && arg !== '-a');
  const parsed = parseArgs(filteredArgs, {
    string: ["name", "version"],
    boolean: ["verbose", "help", "dry-run"],
    alias: {
      n: "name",
      v: "version",
      h: "help",
    },
  });

  if (parsed.help) {
    showHelp();
    exit(0);
  }

  const pos = parsed._;
  let what = pos.length > 0 ? String(pos[0]) : cwd();
  if (!what) what = cwd();

  let name: string | undefined = parsed.name;
  let version: string | undefined = parsed.version;
  if (!name && pos.length > 1) {
    name = String(pos[1]);
  }
  if (!version && pos.length > 2) {
    version = String(pos[2]);
  }

  if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`\n❌ Invalid version format: ${version}. Expected "X.Y.Z"`);
    exit(1);
  }

  return {
    platform: undefined, // No longer user-settable, will be auto-detected elsewhere
    what,
    name,
    version,
    verbose: !!parsed.verbose,
    dryRun: !!parsed["dry-run"],
    all: isAll,
  } as any;
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
    console.error(`\n❌ Error accessing path "${path}": ${error instanceof Error ? error.message : String(error)}`);
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
      console.error(`\n❌ Multiple potential entry points found. Please specify an entry file directly.`);
    } else {
      console.error(`\n❌ No HQL, JS, or TS files found in "${path}".`);
    }
  } catch (error) {
    console.error(`\n❌ Error reading directory "${path}": ${error instanceof Error ? error.message : String(error)}`);
  }

  // If we reach here, no entry point was found
  console.error(`\n❌ Could not determine entry point. Please specify a file directly.`);
  exit(1);
  // This line is never reached due to exit(1) above, but satisfies TypeScript
  return path;
}

/** Main publish function that calls the appropriate publisher. */
export async function publish(args: string[]): Promise<void> {
  // --all support: publish to both npm and jsr with auto version bump
  const options = parsePublishArgs(args);

  if (options.verbose) {
    // Enable verbose logging
    logger.debug("Running with verbose logging enabled");
  }

  // Resolve the entry point file
  const entryPoint = await resolveEntryPoint(options.what);

  // If the user did not specify a file/dir (using default cwd), confirm before proceeding
  const usingDefault = !args.length || (args.length === 1 && ["-w", "--what"].includes(args[0]));
  if (usingDefault && !options.dryRun && Deno.isatty(Deno.stdin.rid)) {
    const defaultFile = entryPoint;
    const confirmMsg = `\nℹ️  No file or directory specified. This will build and publish \"${defaultFile}\" from the current directory.\nDo you want to continue? [Y/n] `;
    await Deno.stdout.write(new TextEncoder().encode(confirmMsg));
    const buf = new Uint8Array(8);
    const n = await Deno.stdin.read(buf);
    const answer = n ? new TextDecoder().decode(buf.subarray(0, n)).trim().toLowerCase() : "";
    if (answer && answer !== "y" && answer !== "yes" && answer !== "") {
      console.log("Aborted by user.");
      exit(0);
    }
  }

  console.log(`
🚀 Preparing to publish your HQL module!\n  Entry point: "${entryPoint}"\n  Package name: ${options.name ?? "(auto-generated)"}\n  Version: ${options.version ?? "(auto-incremented)"}\n  Mode: ${options.dryRun ? "Dry run (no actual publishing)" : "Live publish"}`);

  try {
    // Auto-detect registry/platform (prefer JSR if both present)
    // This logic should be factored into a utility or inside publishJSR/publishNpm.
    // For now, try JSR first, fallback to NPM if needed (legacy behavior)
    let summary: PublishSummary | undefined;
    try {
      summary = await publishJSR({
        ...options,
        what: entryPoint,
      });
    } catch (jsrErr) {
      // If JSR publish fails due to missing config, try NPM
      try {
        summary = await publishNpm({
          ...options,
          what: entryPoint,
        });
      } catch (npmErr) {
        throw jsrErr; // Show original error if both fail
      }
    }
    if (summary) printPublishSummary([summary]);
  } catch (error) {
    reportError(error); 
    exit(1);
  }
}

if (import.meta.main) {
  publish(Deno.args)
}
