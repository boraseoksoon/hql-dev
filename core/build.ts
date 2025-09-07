#!/usr/bin/env -S deno run --allow-all

import * as path from "jsr:@std/path@1";
import { parseArgs } from "https://deno.land/std@0.224.0/cli/parse_args.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/mod.ts";

/**
 * CLI options
 */
interface Options {
  platform?: string;
  arch?: string;
  output: string;
  all: boolean;
  version?: string;
  help: boolean;
  check: boolean;
}

/**
 * Supported build target
 */
interface Target {
  platform: string;
  arch: string;
  triple: string;
}

type BuildResult = {
  platform: string;
  arch: string;
  success: boolean;
  outputPath?: string;
  error?: string;
};

// Officially supported Deno targets
const SUPPORTED_TARGETS: Target[] = [
  { platform: "macos",   arch: "intel", triple: "x86_64-apple-darwin" },
  { platform: "macos",   arch: "arm",   triple: "aarch64-apple-darwin" },
  { platform: "windows", arch: "intel", triple: "x86_64-pc-windows-msvc" },
  { platform: "linux",   arch: "intel", triple: "x86_64-unknown-linux-gnu" },
  { platform: "linux",   arch: "arm",   triple: "aarch64-unknown-linux-gnu" },
];

// Path to HQL CLI entrypoint
const HQL_CLI = "./cli/cli.ts";

/**
 * Print help message
 */
function printHelp() {
  console.log(`
HQL Cross-Platform Build Tool

Usage: deno run --allow-all cli/build.ts [options]

Options:
  --platform, -p <platform>   Target platform [default: current OS]
  --arch, -a <architecture>   Target architecture [default: current arch]
  --output, -o <directory>    Output directory [default: ./bin]
  --all, -all, all            Build all supported targets (all forms are equivalent)
  --version, -v <version>     Append version suffix to output folder
  --help, -h                  Show this help message
`);
}

/**
 * Get current platform in friendly form
 */
const getCurrentPlatform = (): string => {
  switch (Deno.build.os) {
    case "darwin": return "macos";
    case "windows": return "windows";
    case "linux":   return "linux";
    default:         return Deno.build.os;
  }
};

/**
 * Get current architecture in friendly form
 */
const getCurrentArch = (): string => {
  const arch = Deno.build.arch;
  if (/^(x86_64|amd64)$/.test(arch)) return "intel";
  if (/^(aarch64|arm64)$/.test(arch)) return "arm";
  return arch;
};

// Parse CLI arguments
const rawArgs = [...Deno.args];

// Detect 'all' as positional argument (case-insensitive)
let allPositional = false;
if (rawArgs.length && typeof rawArgs[0] === "string" && rawArgs[0].toLowerCase() === "all") {
  allPositional = true;
  rawArgs.shift(); // Remove 'all' from positional args
}

// Detect '-all' (single dash) anywhere in the arguments
let allSingleDash = false;
const dashAllIndex = rawArgs.indexOf('-all');
if (dashAllIndex !== -1) {
  allSingleDash = true;
  rawArgs.splice(dashAllIndex, 1); // Remove '-all' from args
}

const args = parseArgs(rawArgs, {
  string: ["platform", "arch", "output", "version"],
  boolean: ["all", "help", "check"],
  alias: { p: "platform", a: "arch", o: "output", v: "version", h: "help" },
  default: { output: "./bin", all: false, help: false, check: false },
}) as unknown as Options;

if (allSingleDash || allPositional) {
  args.all = true;
}

// Show help and exit
if (args.help) {
  printHelp();
  Deno.exit(0);
}

await ensureDir(args.output);
console.log(`Output directory: ${args.output}`);

// Determine build targets
let targets: Target[];
if (args.all) {
  console.log("Building all supported targets...");
  targets = SUPPORTED_TARGETS;
} else if (args.platform || args.arch) {
  const requestedPlatform = args.platform?.toLowerCase();
  const requestedArch = args.arch?.toLowerCase();
  targets = SUPPORTED_TARGETS.filter(
    t => (!requestedPlatform || t.platform === requestedPlatform) &&
         (!requestedArch  || t.arch === requestedArch)
  );

  if (!targets.length) {
    console.error(`Error: No matching targets for ${args.platform}-${args.arch}`);
    Deno.exit(1);
  }
} else {
  const currentPlatform = getCurrentPlatform();
  const currentArch = getCurrentArch();
  const match = SUPPORTED_TARGETS.find(t => t.platform === currentPlatform && t.arch === currentArch);

  if (!match) {
    console.error(`Unsupported current platform: ${currentPlatform}-${currentArch}`);
    Deno.exit(1);
  }

  targets = [match];
}

/**
 * Build for a single target
 */
async function build(target: Target): Promise<BuildResult> {
  const { platform, arch, triple } = target;
  const suffix = args.version ? `-${args.version}` : "";
  const outDir = path.join(args.output, `${platform}-${arch}${suffix}`);
  const binName = platform === "windows" ? "hql.exe" : "hql";
  const outPath = path.join(outDir, binName);

  await ensureDir(outDir);
  console.log(`Building ${platform}-${arch}${suffix} (${triple})...`);

  const cmd = new Deno.Command("deno", {
    args: [
      "compile",
      "--allow-all",
      ...(args.check ? [] : ["--no-check"]),
      "--target", triple,
      "--output", outPath,
      HQL_CLI,
    ],
    stdout: "inherit",
    stderr: "inherit",
  });

  const { code } = await cmd.output();
  if (code === 0) {
    console.log(`✅ Success: ${outPath}`);
    return { platform, arch, success: true, outputPath: outPath };
  }

  return { platform, arch, success: false, error: `Exit code ${code}` };
}

// Run builds in parallel
(async () => {
  const buildPromises = targets.map(t => build(t));
  const results = await Promise.all(buildPromises);
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;

  console.log("\nBuild Summary:");

  if (failureCount > 0) {
    console.log(`❌ Failed builds: ${failureCount}`);
    
    for (const r of results.filter(r => !r.success)) {
      console.log(`- ${r.platform}-${r.arch}`);
    }

    Deno.exit(1);
  }

  console.log(`✅ All ${successCount} builds succeeded!`);

  Deno.exit(0);
})();
