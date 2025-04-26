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
import { globalLogger as logger } from "../../src/logger.ts";

export interface PublishOptions {
  what: string;
  name?: string;
  version?: string;
  verbose?: boolean;
  dryRun?: boolean;
  all?: boolean;
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

  // Process positional arguments
  const pos = parsed._;
  let what = pos.length > 0 ? String(pos[0]) : cwd();
  if (!what) what = cwd();

  // Handle name and version from positional args if not in flags
  let name: string | undefined = parsed.name;
  let version: string | undefined = parsed.version;
  
  if (!name && pos.length > 1) {
    name = String(pos[1]);
  }
  
  if (!version && pos.length > 2) {
    version = String(pos[2]);
  }

  // Validate version format
  if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`\n❌ Invalid version format: ${version}. Expected "X.Y.Z"`);
    exit(1);
  }

  return {
    what,
    name,
    version,
    verbose: !!parsed.verbose,
    dryRun: !!parsed["dry-run"],
    all: isAll,
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
    console.error(`\n❌ Error accessing path "${path}": ${error instanceof Error ? error.message : String(error)}`);
    exit(1);
  }

  return await findEntryPointInDirectory(path);
}

/**
 * Find a suitable entry point file in a directory
 */
async function findEntryPointInDirectory(path: string): Promise<string> {
  // Check for index files in standard locations
  const candidates = generateCandidateEntryPoints(path);

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

  // Look for any single .hql/.js/.ts file
  return await findSingleSourceFile(path);
}

/**
 * Generate a list of potential entry point file paths
 */
function generateCandidateEntryPoints(path: string): string[] {
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

  return candidates;
}

/**
 * Find a single source file in the directory to use as entry point
 */
async function findSingleSourceFile(path: string): Promise<string> {
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

/**
 * Confirm with user if using default directory
 */
async function confirmDefaultDirectory(
  args: string[],
  options: PublishOptions,
  entryPoint: string,
): Promise<boolean> {
  const usingDefault = !args.length || (args.length === 1 && ["-w", "--what"].includes(args[0]));
  if (usingDefault && !options.dryRun && Deno.stdin.isTerminal()) {
    const confirmMsg =
      `\nℹ️  No file or directory specified. This will build and publish “${entryPoint}” from the current directory.\nDo you want to continue? [Y/n] `;
    await Deno.stdout.write(new TextEncoder().encode(confirmMsg));

    const buf = new Uint8Array(8);
    const n = await Deno.stdin.read(buf);
    const answer = n
      ? new TextDecoder().decode(buf.subarray(0, n)).trim().toLowerCase()
      : "";

    if (answer && answer !== "y" && answer !== "yes" && answer !== "") {
      console.log("Aborted by user.");
      return false;
    }
  }
  return true;
}

/**
 * Print initial information about the publish operation
 */
function printPublishInfo(entryPoint: string, options: PublishOptions): void {
  console.log(`
🚀 Preparing to publish your HQL module!
  Entry point: "${entryPoint}"
  Package name: ${options.name ?? "(auto-generated)"}
  Version: ${options.version ?? "(auto-incremented)"}
  Mode: ${options.dryRun ? "Dry run (no actual publishing)" : "Live publish"}`);
}

/**
 * Publish to JSR and capture the result
 */
async function publishToJSR(options: PublishOptions, entryPoint: string): Promise<PublishSummary> {
  try {
    return await publishJSR({
      ...options,
      what: entryPoint,
    });
  } catch (err) {
    return {
      registry: 'jsr',
      name: options.name ?? '(auto)',
      version: options.version ?? '(auto)',
      link: err && err instanceof Error ? `❌ ${err.message.split('\n')[0]}` : '❌ Failed',
    };
  }
}

/**
 * Publish to NPM and capture the result
 */
async function publishToNPM(options: PublishOptions, entryPoint: string): Promise<PublishSummary> {
  try {
    return await publishNpm({
      ...options,
      what: entryPoint,
    });
  } catch (err) {
    return {
      registry: 'npm',
      name: options.name ?? '(auto)',
      version: options.version ?? '(auto)',
      link: err && err instanceof Error ? `❌ ${err.message.split('\n')[0]}` : '❌ Failed',
    };
  }
}

/** Main publish function that calls the appropriate publisher. */
export async function publish(args: string[]): Promise<void> {
  try {
    // Parse arguments and detect entry point
    const options = parsePublishArgs(args);
    
    if (options.verbose) {
      logger.debug("Running with verbose logging enabled");
    }

    // Resolve the entry point file
    const entryPoint = await resolveEntryPoint(options.what);

    // Confirm if using default directory
    const shouldContinue = await confirmDefaultDirectory(args, options, entryPoint);
    if (!shouldContinue) {
      exit(0);
    }

    // Print information about the publish operation
    printPublishInfo(entryPoint, options);

    // Always attempt both JSR and NPM, capturing results/errors for each
    const summaries: PublishSummary[] = [];
    
    // Publish to JSR
    const jsrSummary = await publishToJSR(options, entryPoint);
    summaries.push(jsrSummary);
    
    // Publish to NPM
    const npmSummary = await publishToNPM(options, entryPoint);
    summaries.push(npmSummary);

    // Always show summary
    printPublishSummary(summaries);

    // Exit 1 only if both failed
    const jsrFailed = jsrSummary.link.startsWith('❌');
    const npmFailed = npmSummary.link.startsWith('❌');
    
    if (jsrFailed && npmFailed) {
      exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Publish failed: ${error instanceof Error ? error.message : String(error)}`);
    exit(1);
  }
}

if (import.meta.main) {
  publish(Deno.args);
}