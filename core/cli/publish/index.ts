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
  jsr?: boolean;
  npm?: boolean;
}

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

function parsePublishArgs(args: string[]): PublishOptions {
  // Handle platform selection flags
  const isAll = args.includes('--all') || args.includes('-a');
  const isNpm = args.includes('--npm');
  const isJsr = args.includes('--jsr');
  
  // Remove platform flags from args for further parsing
  const filteredArgs = args.filter(arg => 
    arg !== '--all' && arg !== '-a' && arg !== '--npm' && arg !== '--jsr'
  );
  
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

  // Determine targets based on flags
  // If --all or -a is specified, publish to both JSR and NPM
  let jsr = isAll || isJsr || (!isNpm && !isAll);
  let npm = isAll || isNpm;

  return {
    what,
    name,
    version,
    verbose: !!parsed.verbose,
    dryRun: !!parsed["dry-run"],
    jsr,
    npm,
  };
}

async function resolveEntryPoint(path: string): Promise<string> {
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

async function findEntryPointInDirectory(path: string): Promise<string> {
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

  // Look for any single source file
  return await findSingleSourceFile(path);
}

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

  console.error(`\n❌ Could not determine entry point. Please specify a file directly.`);
  exit(1);
  return path; // This line is never reached but satisfies TypeScript
}

async function confirmDefaultDirectory(
  args: string[],
  options: PublishOptions,
  entryPoint: string,
): Promise<boolean> {
  const usingDefault = !args.length || (args.length === 1 && ["-w", "--what"].includes(args[0]));
  if (usingDefault && !options.dryRun && Deno.stdin.isTerminal()) {
    const confirmMsg =
      `\nℹ️  No file or directory specified. This will build and publish "${entryPoint}" from the current directory.\nDo you want to continue? [Y/n] `;
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

function printPublishInfo(entryPoint: string, options: PublishOptions): void {
  const targets = [];
  if (options.jsr) targets.push("JSR");
  if (options.npm) targets.push("NPM");
  
  console.log(`
🚀 Preparing to publish your HQL module!
  Entry point: "${entryPoint}"
  Package name: ${options.name ?? "(auto-generated)"}
  Version: ${options.version ?? "(auto-incremented)"}
  Target platforms: ${targets.join(", ")}
  Mode: ${options.dryRun ? "Dry run (no actual publishing)" : "Live publish"}`);
}

async function publishToRegistry(
  registry: "jsr" | "npm",
  options: PublishOptions, 
  entryPoint: string
): Promise<PublishSummary> {
  try {
    return registry === "jsr" 
      ? await publishJSR({ ...options, what: entryPoint })
      : await publishNpm({ ...options, what: entryPoint });
  } catch (err) {
    return {
      registry,
      name: options.name ?? '(auto)',
      version: options.version ?? '(auto)',
      link: err instanceof Error ? `❌ ${err.message.split('\n')[0]}` : '❌ Failed',
    };
  }
}

export async function publish(args: string[]): Promise<void> {
  try {
    const options = parsePublishArgs(args);
    
    if (options.verbose) {
      logger.debug("Running with verbose logging enabled");
    }

    const entryPoint = await resolveEntryPoint(options.what);

    const shouldContinue = await confirmDefaultDirectory(args, options, entryPoint);
    if (!shouldContinue) {
      exit(0);
    }

    printPublishInfo(entryPoint, options);

    const summaries: PublishSummary[] = [];
    
    // Publish to JSR if requested
    if (options.jsr) {
      const jsrSummary = await publishToRegistry("jsr", options, entryPoint);
      summaries.push(jsrSummary);
    }
    
    // Publish to NPM if requested
    if (options.npm) {
      const npmSummary = await publishToRegistry("npm", options, entryPoint);
      summaries.push(npmSummary);
    }

    printPublishSummary(summaries);

    // Check if all publishing attempts failed
    const allFailed = summaries.every(summary => summary.link.startsWith('❌'));
    
    if (allFailed) {
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