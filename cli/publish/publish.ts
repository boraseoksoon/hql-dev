// cli/publish/publish.ts
import { parseArgs } from "jsr:@std/cli@1.0.13/parse-args";
import { cwd, exit } from "../../src/platform/platform.ts";
import { publishNpm } from "./publish_npm.ts";
import { publishJSR } from "./publish_jsr.ts";

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
  # 1) Publish ./my-module to JSR (default) with auto name/version
  hql_publish ./my-module

  # 2) Publish ./my-module to NPM
  hql_publish ./my-module npm

  # 3) Publish ./my-module to JSR with an explicit package name
  hql_publish ./my-module jsr my-awesome-package

  # 4) Publish ./my-module to JSR with an explicit version
  hql_publish ./my-module jsr my-awesome-package 1.2.3

  # 5) Use flags instead of positional arguments:
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
 * Parses the command-line arguments to produce a PublishOptions object.
 * 
 * New ordering:
 *   pos[0] => <what> (path)
 *   pos[1] => [platform] ("jsr" or "npm")
 *   pos[2] => [name]
 *   pos[3] => [version]
 * 
 * The flags (-where, -name, -version) override the positional arguments.
 */
function parsePublishArgs(args: string[]): PublishOptions {
  const parsed = parseArgs(args, {
    string: ["what", "where", "name", "version"],
    boolean: ["verbose", "help"],
    alias: {
      w: "what",
      n: "name",
      v: "version",
      h: "help",
    },
  });

  // Check for help
  if (parsed.help) {
    showHelp();
    exit(0);
  }

  // By default, platform is "jsr"
  let platform: "jsr" | "npm" = "jsr";
  // If user used -where, parse that
  if (parsed.where) {
    const w = String(parsed.where).toLowerCase();
    if (w === "npm" || w === "jsr") {
      platform = w as "jsr" | "npm";
    } else {
      console.error(`Invalid value for -where: "${parsed.where}". Must be 'npm' or 'jsr'.`);
      exit(1);
    }
  }

  // Positional arguments
  const pos = parsed._;

  // pos[0] => <what>
  let what = parsed.what || "";
  if (!what && pos.length > 0) {
    what = String(pos[0]);
  }
  if (!what) {
    what = cwd();
  }

  // pos[1] => [platform], but only if -where wasn't used
  if (!parsed.where && pos.length > 1) {
    const maybePlatform = String(pos[1]).toLowerCase();
    if (maybePlatform === "npm" || maybePlatform === "jsr") {
      platform = maybePlatform as "jsr" | "npm";
    } else {
      // If the user typed something that isn't "jsr" or "npm" as second arg, throw an error
      console.error(`Invalid platform: "${pos[1]}". Must be "npm" or "jsr".`);
      exit(1);
    }
  }

  // Next positions for name & version:
  // If pos[1] was recognized as a platform, name is pos[2], version is pos[3]
  // If pos[1] doesn't exist or was invalid, we already errored out above
  let name: string | undefined = parsed.name;
  let version: string | undefined = parsed.version;

  // If we recognized pos[1] as the platform, then pos[2] is name, pos[3] is version
  if (!name && pos.length > 2) {
    name = String(pos[2]);
  }
  if (!version && pos.length > 3) {
    version = String(pos[3]);
  }

  // Validate version format if provided
  if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`Invalid version format: ${version}. Expected "X.Y.Z"`);
    exit(1);
  }

  return {
    platform,
    what,
    name,
    version,
    verbose: parsed.verbose,
  };
}

/** Main function that calls publishNpm or publishJSR based on platform. */
export async function publish(args: string[]): Promise<void> {
  const options = parsePublishArgs(args);

  if (options.verbose) {
    console.log("Running with verbose logging enabled\n");
  }

  console.log(`Publishing ${options.platform.toUpperCase()} package with:
  Directory (what): ${options.what}
  Name: ${options.name ?? "(auto-generated)"}
  Version: ${options.version ?? "(auto-incremented)"}
`);

  if (options.platform === "npm") {
    await publishNpm(options);
  } else {
    await publishJSR(options);
  }
}

// If invoked directly:
if (import.meta.main) {
  publish(Deno.args).catch((err) => {
    console.error("Publish failed:", err);
    exit(1);
  });
}
