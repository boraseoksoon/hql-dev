import { parseArgs } from "jsr:@std/cli@1.0.13/parse-args";
import { 
  exit, 
  exists,
  dirname,
} from "../../src/platform/platform.ts";
import { publishNpm } from "./publish_npm.ts";
import { publishJSR } from "./publish_jsr.ts";
import { printPublishSummary, PublishSummary } from "./publish_summary.ts";
import { globalLogger as logger } from "../../src/logger.ts";
import { 
  detectMetadataFiles, 
  getPlatformsFromArgs, 
  MetadataFileType 
} from "./utils.ts";

export interface PublishOptions {
  entryFile: string;
  platforms: ("jsr" | "npm")[];
  version?: string;
  verbose?: boolean;
  dryRun?: boolean;
}

function showHelp() {
  console.log(`
HQL Publish Tool - Publish HQL modules to NPM or JSR

USAGE:
  hql publish <entry-file> [platform] [version] [options]

EXAMPLES:
  # Publish to JSR (default):
  hql publish ./my-module/index.hql

  # Publish to NPM:
  hql publish ./my-module/index.hql npm

  # Publish to JSR with specific version:
  hql publish ./my-module/index.hql jsr 1.2.3

  # Publish to NPM with specific version:
  hql publish ./my-module/index.hql npm 1.2.3

  # Publish to both JSR and NPM:
  hql publish ./my-module/index.hql all

  # Publish to both JSR and NPM with specific version:
  hql publish ./my-module/index.hql all 1.2.3

  # Dry run mode (no actual publishing):
  hql publish ./my-module/index.hql --dry-run

OPTIONS:
  --dry-run                   Test the publishing process without actually publishing
  --verbose                   Enable verbose logging
  -h, --help                  Show this help message

ENVIRONMENT VARIABLES:
  DRY_RUN_PUBLISH=1           Always perform a dry run
  SKIP_LOGIN_CHECK=1          Skip registry authentication check
`);
}

function parsePublishArgs(args: string[]): PublishOptions {
  if (args.includes("-h") || args.includes("--help")) {
    showHelp();
    exit(0);
  }

  const parsed = parseArgs(args, {
    boolean: ["verbose", "help", "dry-run"],
    alias: {
      h: "help",
    },
  });

  if (parsed._.length === 0) {
    console.error("\n❌ Error: Missing entry file path. You must specify the module's entry .hql file.");
    showHelp();
    exit(1);
  }

  const entryFile = String(parsed._[0]);
  const platforms = getPlatformsFromArgs(args);
  
  let version: string | undefined;
  
  for (let i = 1; i < parsed._.length; i++) {
    const arg = String(parsed._[i]);
    if (/^\d+\.\d+\.\d+$/.test(arg)) {
      version = arg;
      logger.debug && logger.debug(`Found version parameter: ${version} at position ${i}`);
      break;
    }
  }

  if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`\n❌ Invalid version format: ${version}. Expected "X.Y.Z"`);
    exit(1);
  }

  return {
    entryFile,
    platforms,
    version,
    verbose: !!parsed.verbose,
    dryRun: !!parsed["dry-run"] || Deno.env.get("DRY_RUN_PUBLISH") === "1",
  };
}

function printPublishInfo(entryFile: string, options: PublishOptions, metadataStatus: Record<string, MetadataFileType | null>): void {
  const targetPlatforms = options.platforms.map(p => p.toUpperCase()).join(", ");
  
  const jsrMetadataStatus = metadataStatus.jsr ? "Using existing metadata" : "Will create metadata";
  const npmMetadataStatus = metadataStatus.npm ? "Using existing metadata" : "Will create metadata";

  console.log(`
🚀 Preparing to publish your HQL module!
  Entry file: "${entryFile}"
  Version: ${options.version ? options.version : "(auto-determined)"}
  Target platforms: ${targetPlatforms}
  JSR: ${jsrMetadataStatus}
  NPM: ${npmMetadataStatus}
  Mode: ${options.dryRun ? "Dry run (no actual publishing)" : "Live publish"}`);
}

async function publishToRegistry(
  registry: "jsr" | "npm",
  options: PublishOptions, 
  metadataStatus: Record<string, MetadataFileType | null>
): Promise<PublishSummary> {
  console.log(`\n📦 Starting ${registry.toUpperCase()} package publishing process`);
  
  try {
    return registry === "jsr" 
      ? await publishJSR({ 
          entryFile: options.entryFile,
          version: options.version,
          hasMetadata: !!metadataStatus.jsr,
          metadataType: metadataStatus.jsr || undefined,
          verbose: options.verbose,
          dryRun: options.dryRun
        })
      : await publishNpm({ 
          entryFile: options.entryFile,
          version: options.version,
          hasMetadata: !!metadataStatus.npm,
          metadataType: metadataStatus.npm || undefined,
          verbose: options.verbose,
          dryRun: options.dryRun
        });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ ${registry.toUpperCase()} publish failed: ${errorMessage}`);
    
    return {
      registry,
      name: metadataStatus[registry] ? `(from ${metadataStatus[registry]})` : '(unknown)',
      version: options.version ?? '(auto)',
      link: `❌ ${errorMessage}`
    };
  }
}

export async function publish(args: string[]): Promise<void> {
  try {
    const options = parsePublishArgs(args);
    
    if (options.verbose) {
      logger.debug("Running with verbose logging enabled");
      logger.debug(`Parsed options: ${JSON.stringify(options, null, 2)}`);
    }

    if (!await exists(options.entryFile)) {
      console.error(`\n❌ Entry file not found: ${options.entryFile}`);
      exit(1);
    }

    const moduleDir = dirname(options.entryFile);
    const metadataStatus = await detectMetadataFiles(moduleDir);
    
    if (options.verbose) {
      logger.debug(`Metadata status: ${JSON.stringify(metadataStatus, null, 2)}`);
    }

    printPublishInfo(options.entryFile, options, metadataStatus);

    // Determine if all selected platforms have metadata
    // Always run publishes sequentially, regardless of metadata state
    const summaries: PublishSummary[] = [];
    for (const platform of options.platforms) {
      const platformMetadataStatus = platform === "jsr"
        ? { jsr: metadataStatus.jsr, npm: null }
        : { jsr: null, npm: metadataStatus.npm };
      try {
        const summary = await publishToRegistry(platform, options, platformMetadataStatus);
        summaries.push(summary);
      } catch (err) {
        console.error(`\n❌ ${platform.toUpperCase()} publish process encountered an error: ${err}`);
        summaries.push({
          registry: platform,
          name: '(unknown)',
          version: options.version ?? '(auto)',
          link: `❌ Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    printPublishSummary(summaries);

    const allFailed = summaries.every(summary => summary.link.startsWith('❌'));
    if (allFailed) {
      exit(1);
    } else if (summaries.some(summary => summary.link.startsWith('❌'))) {
      console.log("\n⚠️ Some publishing operations failed. Check the summary for details.");
    }
  } catch (error) {
    console.error(`\n❌ Publish failed: ${error instanceof Error ? error.message : String(error)}`);
    exit(1);
  }
}

if (import.meta.main) {
  publish(Deno.args);
}