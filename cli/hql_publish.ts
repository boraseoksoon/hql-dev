#!/usr/bin/env -S deno run -A
// cli/hql_publish.ts - CLI utility for publishing HQL modules to NPM or JSR

import { publish } from "./publish/publish.ts";
import { parseArgs } from "jsr:@std/cli@1.0.13/parse-args";
import { exit } from "../src/platform/platform.ts";

// Show help information
function showHelp() {
  console.log(`
HQL Publish Tool - Publish HQL modules to NPM or JSR

USAGE:
  hql_publish [options] [platform] [directory] [name] [version]

PLATFORMS:
  jsr     Publish to JSR (default)
  npm     Publish to NPM

OPTIONS:
  -what, -w      Directory or file to publish (defaults to current directory)
  -name, -n      Package name (defaults to directory name)
  -version, -v   Package version (defaults to auto-increment)
  -where         Target platform: 'npm' or 'jsr' (defaults to 'jsr')
  -verbose       Enable verbose logging
  -help, -h      Show this help message

EXAMPLES:
  # Publish current directory to JSR with auto-generated name and version
  hql_publish

  # Publish to NPM with specified name
  hql_publish npm -name my-package

  # Publish specific directory to JSR with specified version
  hql_publish jsr ./my-module -version 1.2.3

  # Publish using positional arguments: platform, directory, name, version
  hql_publish npm ./my-module my-awesome-package 0.1.0
`);
}

// Main function
async function main() {
  const args = Deno.args;
  
  // Parse the arguments to check for help flag
  const parsedArgs = parseArgs(args, {
    boolean: ["help", "verbose"],
    string: ["what", "name", "version", "where"],
    alias: {
      h: "help",
      w: "what",
      n: "name",
      v: "verbose"
    },
    // This allows parsing single-dash options
    prefix: "-"
  });
  
  // If help flag is present, show help and exit
  if (parsedArgs.help) {
    showHelp();
    exit(0);
  }
  
  try {
    // Print a nice banner
    console.log("\n✨ HQL Publish Tool ✨\n");
    
    // Pass the raw args to the publish function
    await publish(args);
  } catch (error) {
    console.error("\n❌ Publishing failed:", error.message);
    exit(1);
  }
}

// Run the main function if this file is executed directly
if (import.meta.main) {
  main().catch(error => {
    console.error("Unhandled error:", error);
    exit(1);
  });
}