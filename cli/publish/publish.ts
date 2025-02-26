// cli/publish.ts
import { parseArgs } from "jsr:@std/cli@1.0.13/parse-args";
import { basename } from "jsr:@std/path@1.0.8";
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

// Normalize flag formats to consistent format.
// Now we accept both single and double dash formats for all options
function normalizeArgs(args: string[]): string[] {
  // List of allowed option names (without dashes)
  const allowed = new Set(["what", "name", "version", "where", "verbose", "v", "w", "n", "h", "help"]);
  
  return args.map(arg => {
    if (arg.startsWith("-") && !arg.startsWith("--")) {
      const key = arg.slice(1);
      if (allowed.has(key)) {
        // Keep it as single dash as the user prefers
        return arg;
      }
    }
    // If it's a double dash option that should be single dash, convert it
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (allowed.has(key)) {
        return `-${key}`;
      }
    }
    return arg;
  });
}

/**
* Parses publish arguments.
*
* For JSR:
*    If the positional parameters are ["jsr", <targetDir>] then package name is undefined
*    and will default to `@username/<basename(targetDir)>`.
*    If they are ["jsr", <targetDir>, <packageName>], then <packageName> is used.
*
* For npm, similar logic applies.
*/
function parsePublishArgs(args: string[]): PublishOptions {
  // Don't normalize args - use them as is
  const parsed = parseArgs(args, {
    string: ["what", "name", "version", "where"],
    boolean: ["verbose", "help"],
    alias: {
      v: "verbose",
      w: "what",
      n: "name",
      h: "help"
    },
    // Single-dash prefix
    prefix: "-"
  });
  
  // Accept both forms of flags without validation error
  const allowedFlags = new Set(["what", "name", "version", "where", "verbose", "help", "v", "w", "n", "h", "_"]);
  for (const key of Object.keys(parsed)) {
    if (!allowedFlags.has(key)) {
      console.error(`Unknown flag: -${key}. Allowed flags: -what, -name, -version, -where, -verbose, -help`);
      exit(1);
    }
  }
  
  if (parsed.version && !/^\d+\.\d+\.\d+$/.test(parsed.version)) {
    console.error(`Invalid version format: ${parsed.version}. Expected format: X.Y.Z`);
    exit(1);
  }
  
  let platform: "jsr" | "npm" = "npm"; // Default to npm
  if (parsed.where) {
    const whereVal = String(parsed.where).toLowerCase();
    if (whereVal === "npm" || whereVal === "jsr") {
      platform = whereVal as "jsr" | "npm";
    } else {
      console.error("Invalid value for -where flag. Must be 'npm' or 'jsr'.");
      exit(1);
    }
  }
  
  if (parsed.version && !/^\d+\.\d+\.\d+$/.test(parsed.version)) {
    console.error(`Invalid version format: ${parsed.version}. Expected format: X.Y.Z`);
    exit(1);
  }
  
  if (parsed.where) {
    const whereVal = String(parsed.where).toLowerCase();
    if (whereVal === "npm" || whereVal === "jsr") {
      platform = whereVal as "jsr" | "npm";
    } else {
      console.error("Invalid value for -where flag. Must be 'npm' or 'jsr'.");
      exit(1);
    }
  }
  
  const pos = parsed._;
  let what = pos.length > 0 ? String(pos[0]) : cwd();
  
  // If the first positional argument is a platform flag, adjust accordingly.
  if (pos.length > 0 && ["npm", "jsr"].includes(String(pos[0]).toLowerCase())) {
    platform = String(pos[0]).toLowerCase() as "jsr" | "npm";
    what = pos.length > 1 ? String(pos[1]) : cwd();
  }
  
  if (parsed.what) {
    what = String(parsed.what);
  }
  
  if (!what) {
    what = cwd();
  }
  
  let name: string | undefined;
  if (parsed.name) {
    name = String(parsed.name);
  } else {
    if (platform === "jsr") {
      // Only use a positional package name if explicitly provided as the third parameter.
      if (pos.length >= 3) {
        name = String(pos[2]);
      }
    } else if (platform === "npm") {
      if (pos.length >= 3 && !["npm", "jsr"].includes(String(pos[0]).toLowerCase())) {
        name = String(pos[2]);
      } else if (pos.length >= 4) {
        name = String(pos[3]);
      }
    }
  }
  
  let version: string | undefined;
  if (parsed.version) {
    version = String(parsed.version);
  } else {
    if (platform === "jsr") {
      if (pos.length >= 4) {
        version = String(pos[3]);
      }
    } else if (platform === "npm") {
      if (pos.length >= 3 && !["npm", "jsr"].includes(String(pos[0]).toLowerCase())) {
        version = String(pos[3]);
      } else if (pos.length >= 4) {
        version = String(pos[4]);
      }
    }
  }
  
  return { 
    platform, 
    what, 
    name, 
    version,
    verbose: parsed.verbose 
  };
}

/**
* Main publish mediator.
*/
export async function publish(args: string[]): Promise<void> {
  const options = parsePublishArgs(args);
  
  if (options.verbose) {
    console.log("Running with verbose logging enabled");
  }
  
  if (options.platform === "npm") {
    console.log(`Publishing npm package with:
  Directory: ${options.what}
  Package Name: ${options.name ?? "(auto-generated)"}
  Version: ${options.version ?? "(auto-incremented)"}`);
    
    await publishNpm({ 
      what: options.what, 
      name: options.name, 
      version: options.version,
      verbose: options.verbose
    });
  } else {
    console.log(`Publishing JSR package with:
  Directory: ${options.what}
  Package Name: ${options.name ?? "(auto-generated)"}
  Version: ${options.version ?? "(auto-incremented)"}`);
    
    await publishJSR({ 
      what: options.what, 
      name: options.name, 
      version: options.version,
      verbose: options.verbose 
    });
  }
}

// Run the publish command if executed directly
if (import.meta.main) {
  publish(Deno.args).catch(error => {
    console.error("Failed to publish:", error);
    exit(1);
  });
}

export default publish;