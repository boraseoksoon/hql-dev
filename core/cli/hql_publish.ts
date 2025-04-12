#!/usr/bin/env -S deno run -A
// cli/hql_publish.ts - CLI utility for publishing HQL modules

import { publish } from "./publish/publish.ts";
import { parseArgs } from "jsr:@std/cli@1.0.13/parse-args";
import { exit } from "../src/platform/platform.ts";

function showHelp() {
  console.log(`
HQL Publish Tool - Publish HQL modules to NPM or JSR

USAGE:
  hql_publish [options] <what> [platform] [name] [version]

PLATFORMS:
  jsr     Publish to JSR (default)
  npm     Publish to NPM

OPTIONS:
  -what, -w      Directory or HQL file to publish (defaults to current directory)
  -name, -n      Package name (defaults to auto-generated)
  -version, -v   Package version (defaults to auto-increment)
  -where         Target platform: 'npm' or 'jsr' (defaults to 'jsr')
  -verbose       Enable verbose logging
  -help, -h      Show this help message

EXAMPLES:
  hql_publish ./my-module
  hql_publish ./my-module npm
  hql_publish ./my-module jsr my-awesome-package 1.2.3
  hql_publish ./my-module -where=jsr -name=my-awesome-package -version=1.2.3
`);
}

async function main() {
  const args = Deno.args;
  const parsedArgs = parseArgs(args, {
    boolean: ["help", "verbose"],
    string: ["what", "name", "version", "where"],
    alias: { h: "help", w: "what", n: "name", v: "version" },
    prefix: "-",
  });
  if (parsedArgs.help) {
    showHelp();
    exit(0);
  }
  console.log("\n✨ HQL Publish Tool ✨\n");
  if (Deno.env.get("HQL_DEV") === "1") {
    Deno.env.set("SKIP_LOGIN_CHECK", "1");
  }
  try {
    await publish(args);
  } catch (error) {
    console.error("\n❌ Publishing failed:", error.message);
    exit(1);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("\n❌ Unhandled error:", error.message);
    exit(1);
  });
}
