// cli/publish/publish.ts - Improved with better logging and code structure
import { parseArgs } from "jsr:@std/cli@1.0.13/parse-args";
import { cwd, exit } from "../../src/platform/platform.ts";
import { publishNpm } from "./publish_npm.ts";
import { publishJSR } from "./publish_jsr.ts";
import { checkEnvironment } from "./publish_common.ts";

export interface PublishOptions {
  platform: "jsr" | "npm";
  what: string;
  name?: string;
  version?: string;
  verbose?: boolean;
}

/** Show help information */
function showHelp() {
  console.log(`
HQL Publish Tool - Publish HQL modules to NPM or JSR

USAGE:
  hql_publish [options] <what> [platform] [name] [version]

EXAMPLES:
  # Publish to JSR (default) with auto name/version:
  hql_publish ./my-module

  # Publish to NPM:
  hql_publish ./my-module npm

  # Publish to JSR with explicit name and version:
  hql_publish ./my-module jsr my-awesome-package 1.2.3

  # Use flags:
  hql_publish ./my-module -where=jsr -name=my-awesome-package -version=1.2.3

OPTIONS:
  -what, -w      Directory or HQL file to publish (defaults to current directory)
  -where         Target platform: 'npm' or 'jsr' (defaults to 'jsr')
  -name, -n      Package name (defaults to auto-generated)
  -version, -v   Package version (defaults to auto-increment or prompt)
  -verbose       Enable verbose logging
  -help, -h      Show this help message
`);
}

/**
 * Parse command-line arguments to produce a PublishOptions object.
 * Ordering:
 *   pos[0] => what (path)
 *   pos[1] => platform ("jsr" or "npm")
 *   pos[2] => name
 *   pos[3] => version
 * Flags (-where, -name, -version) override positional values.
 */
function parsePublishArgs(args: string[]): PublishOptions {
  const parsed = parseArgs(args, {
    string: ["what", "where", "name", "version"],
    boolean: ["verbose", "help"],
    alias: { w: "what", n: "name", v: "version", h: "help" },
  });

  if (parsed.help) {
    showHelp();
    exit(0);
  }

  let platform: "jsr" | "npm" = "jsr";
  if (parsed.where) {
    const w = String(parsed.where).toLowerCase();
    if (w === "npm" || w === "jsr") {
      platform = w as "jsr" | "npm";
    } else {
      console.error(`\n❌ Invalid value for -where: "${parsed.where}". Must be 'npm' or 'jsr'.`);
      exit(1);
    }
  }

  const pos = parsed._;
  let what = parsed.what || (pos.length > 0 ? String(pos[0]) : cwd());
  if (!what) what = cwd();

  if (!parsed.where && pos.length > 1) {
    const maybePlatform = String(pos[1]).toLowerCase();
    if (maybePlatform === "npm" || maybePlatform === "jsr") {
      platform = maybePlatform as "jsr" | "npm";
    } else {
      console.error(`\n❌ Invalid platform: "${pos[1]}". Must be "npm" or "jsr".`);
      exit(1);
    }
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

  return { platform, what, name, version, verbose: parsed.verbose };
}

/** Main publish function that calls the appropriate publisher. */
export async function publish(args: string[]): Promise<void> {
  const options = parsePublishArgs(args);
  
  if (options.verbose) {
    console.log("Running with verbose logging enabled\n");
  }
  
  console.log(`Publishing ${options.platform.toUpperCase()} package with:
  Directory (what): "${options.what}"
  Name: ${options.name ?? "(auto-generated)"}
  Version: ${options.version ?? "(auto-incremented)"}`);

  // Check environment before proceeding
  if (!await checkEnvironment(options.platform)) {
    console.error("\n❌ Environment check failed. Please fix the issues before publishing.");
    exit(1);
  }
  
  try {
    if (options.platform === "npm") {
      await publishNpm(options);
    } else {
      await publishJSR(options);
    }
    console.log("\n✅ Publishing completed successfully!");
  } catch (error) {
    console.error("\n❌ Publishing failed:", error instanceof Error ? error.message : String(error));
    exit(1);
  }
}

if (import.meta.main) {
  publish(Deno.args).catch((err) => {
    console.error("\n❌ Publish failed:", err instanceof Error ? err.message : String(err));
    exit(1);
  });
}