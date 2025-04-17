// cli/build.ts - Cross-platform build script for HQL

import { parseArgs } from "https://deno.land/std@0.224.0/cli/parse_args.ts";
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/mod.ts";

// ======== TYPES & INTERFACES =========

interface BuildOptions {
  platform?: string;
  arch?: string;
  output: string;
  all: boolean;
  version?: string;
  help: boolean;
  check: boolean;
}

interface Target {
  platform: string;
  arch: string;
  triple: string;
}

interface BuildResult {
  platform: string;
  arch: string;
  success: boolean;
  outputPath?: string;
  error?: string;
}

// ======== CONSTANTS =========

// Define only officially supported target combinations by Deno
const SUPPORTED_TARGETS: Target[] = [
  { platform: "macos", arch: "intel", triple: "x86_64-apple-darwin" },
  { platform: "macos", arch: "arm", triple: "aarch64-apple-darwin" },
  { platform: "windows", arch: "intel", triple: "x86_64-pc-windows-msvc" },
  { platform: "linux", arch: "intel", triple: "x86_64-unknown-linux-gnu" },
  { platform: "linux", arch: "arm", triple: "aarch64-unknown-linux-gnu" }
];

// Get the correct path to the CLI relative to where the script is running
const HQL_CLI_PATH = "./cli/cli.ts";

// ======== HELPER FUNCTIONS =========

/**
 * Prints help message for the build tool
 */
function printHelp() {
  console.log(`
HQL Cross-Platform Build Tool

Usage: deno run --allow-all cli/build.ts [options]

Options:
  --platform, -p <platform>   Target platform [default: current OS]
                              Supported platforms: macos, windows, linux
  --arch, -a <architecture>   Target architecture [default: current arch]
                              Supported architectures: intel, arm
  --output, -o <directory>    Output directory [default: ./bin]
  --all                       Build for all supported platforms and architectures
  --version, -v <version>     Version tag for the binary
  --help, -h                  Show this help message

Supported platform combinations:
  - macos-intel (x86_64-apple-darwin)
  - macos-arm (aarch64-apple-darwin)
  - windows-intel (x86_64-pc-windows-msvc)
  - linux-intel (x86_64-unknown-linux-gnu)
  - linux-arm (aarch64-unknown-linux-gnu)

Examples:
  # Build for current platform
  deno run --allow-all cli/build.ts
  
  # Build for all supported platforms
  deno run --allow-all cli/build.ts --all
  
  # Build for specific platforms
  deno run --allow-all cli/build.ts -p macos        # macOS (current architecture)
  deno run --allow-all cli/build.ts -p windows      # Windows (current architecture)
  deno run --allow-all cli/build.ts -p linux        # Linux (current architecture)
  
  # Build for specific architectures
  deno run --allow-all cli/build.ts -a intel        # Current OS with Intel architecture
  deno run --allow-all cli/build.ts -a arm          # Current OS with ARM architecture
  
  # Build for specific platform-architecture combinations
  deno run --allow-all cli/build.ts -p macos -a intel    # macOS Intel
  deno run --allow-all cli/build.ts -p macos -a arm      # macOS ARM
  deno run --allow-all cli/build.ts -p windows -a intel  # Windows Intel
  deno run --allow-all cli/build.ts -p linux -a intel    # Linux Intel
  deno run --allow-all cli/build.ts -p linux -a arm      # Linux ARM
  
  # Build with custom output directory
  deno run --allow-all cli/build.ts -o ./dist       # Output to ./dist directory
  
  # Build with version tag
  deno run --allow-all cli/build.ts -v 1.0.0        # Add version to directory name
`);
}

/**
 * Get the current platform name in user-friendly format (lowercase)
 */
function getCurrentPlatform(): string {
  const os = Deno.build.os;
  if (os === "darwin") return "macos";
  if (os === "windows") return "windows";
  if (os === "linux") return "linux";
  return os; // Fallback to whatever Deno reports
}

/**
 * Get the current architecture name in user-friendly format
 */
function getCurrentArch(): string {
  const arch: string = Deno.build.arch;
  if (arch === "x86_64" || arch === "amd64") return "intel";
  if (arch === "aarch64" || arch === "arm64") return "arm";
  return arch; // Fallback to whatever Deno reports
}

/**
 * Check if a platform-architecture combination is supported
 */
function isSupported(platform: string, arch: string): boolean {
  return SUPPORTED_TARGETS.some(
    t => t.platform === platform.toLowerCase() && t.arch === arch.toLowerCase()
  );
}

/**
 * Get the target triple for a platform-architecture combination
 */
function getTargetTriple(platform: string, arch: string): string {
  const target = SUPPORTED_TARGETS.find(
    t => t.platform === platform.toLowerCase() && t.arch === arch.toLowerCase()
  );
  
  if (!target) {
    throw new Error(`Unsupported platform/architecture combination: ${platform}/${arch}`);
  }
  
  return target.triple;
}

/**
 * Get directory name for the platform/arch
 */
function getPlatformDirName(platform: string, arch: string, version?: string): string {
  // Ensure lowercase
  platform = platform.toLowerCase();
  arch = arch.toLowerCase();
  
  const versionSuffix = version ? `-${version}` : "";
  return `${platform}-${arch}${versionSuffix}`;
}

/**
 * Generate binary name and output path
 */
function getBinaryPath(outputDir: string, platform: string, arch: string, version?: string): string {
  const binaryName = platform.toLowerCase() === "windows" ? "hql.exe" : "hql";
  const platformDir = getPlatformDirName(platform, arch, version);
  const fullOutputDir = path.join(outputDir, platformDir);
  
  return path.join(fullOutputDir, binaryName);
}

// ======== BUILD FUNCTIONS =========

/**
 * Build HQL for a specific platform and architecture
 */
async function buildForPlatform(
  platform: string, 
  arch: string, 
  outputDir: string, 
  version?: string,
  check = false
): Promise<BuildResult> {
  try {
    // Ensure lowercase
    platform = platform.toLowerCase();
    arch = arch.toLowerCase();
    
    // Check if platform/arch combination is supported
    if (!isSupported(platform, arch)) {
      console.error(`❌ Skipping ${platform}-${arch}: This combination is not supported by Deno`);
      return {
        platform,
        arch,
        success: false,
        error: "Unsupported platform/architecture combination"
      };
    }
    
    const outputPath = getBinaryPath(outputDir, platform, arch, version);
    const targetTriple = getTargetTriple(platform, arch);
    const platformDir = path.dirname(outputPath);
    
    console.log(`Building HQL for ${platform}-${arch} (${targetTriple})...`);
    
    // Ensure platform directory exists
    await ensureDir(platformDir);
    
    // Base arguments
    const args = [
      "compile",
      "--allow-all",
      "--target", targetTriple,
      "--output", outputPath
    ];
    
    // Add no-check option unless check is true
    if (!check) {
      args.push("--no-check");
    }
    
    // Add the path to the CLI
    args.push(HQL_CLI_PATH);
    
    // Create the command for cross-compilation
    const cmd = new Deno.Command("deno", {
      args,
      stdout: "piped",
      stderr: "piped",
    });
    
    const process = cmd.spawn();
    const { code, stderr } = await process.output();
    
    if (code === 0) {
      console.log(`✅ Successfully built HQL binary for ${platform}-${arch}`);
      console.log(`   Output: ${outputPath}`);
      return {
        platform,
        arch,
        success: true,
        outputPath
      };
    } else {
      const errorMsg = new TextDecoder().decode(stderr);
      console.error(`❌ Failed to build for ${platform}-${arch}`);
      console.error(errorMsg);
      return {
        platform,
        arch,
        success: false,
        error: errorMsg
      };
    }
  } catch (error) {
    console.error(`❌ Error building for ${platform}-${arch}: ${error instanceof Error ? error.message : String(error)}`);
    return {
      platform,
      arch,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Build HQL for the current platform and architecture
 */
async function buildForCurrentPlatform(outputDir: string, version?: string, check = false): Promise<BuildResult> {
  const platform = getCurrentPlatform();
  const arch = getCurrentArch();
  
  console.log(`Building HQL for current platform (${platform}-${arch})...`);
  
  try {
    const outputPath = getBinaryPath(outputDir, platform, arch, version);
    const platformDir = path.dirname(outputPath);
    
    // Ensure platform directory exists
    await ensureDir(platformDir);
    
    // Base arguments
    const args = [
      "compile",
      "--allow-all",
      "--output", outputPath
    ];
    
    // Add no-check option unless check is true
    if (!check) {
      args.push("--no-check");
    }
    
    // Add the path to the CLI
    args.push(HQL_CLI_PATH);
    
    const cmd = new Deno.Command("deno", {
      args,
      stdout: "piped",
      stderr: "piped",
    });
    
    const process = cmd.spawn();
    const { code, stderr } = await process.output();
    
    if (code === 0) {
      console.log(`✅ Successfully built HQL binary for current platform`);
      console.log(`   Output: ${outputPath}`);
      return {
        platform,
        arch,
        success: true,
        outputPath
      };
    } else {
      const errorMsg = new TextDecoder().decode(stderr);
      console.error(`❌ Failed to build for current platform`);
      console.error(errorMsg);
      return {
        platform,
        arch,
        success: false,
        error: errorMsg
      };
    }
  } catch (error) {
    console.error(`❌ Error building for current platform: ${error instanceof Error ? error.message : String(error)}`);
    return {
      platform,
      arch,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// ======== MAIN FUNCTION =========

/**
 * Main function to parse arguments and execute builds
 */
async function main() {
  // Parse command line arguments with non-deprecated parseArgs
  const args = parseArgs(Deno.args, {
    string: ["platform", "arch", "output", "version"],
    boolean: ["all", "help", "check"],
    alias: {
      p: "platform",
      a: "arch",
      o: "output",
      v: "version",
      h: "help"
    },
    default: {
      output: "./bin",
      all: false,
      help: false,
      check: false  // Type checking OFF by default
    }
  }) as unknown as BuildOptions;
  
  // Show help if requested
  if (args.help) {
    printHelp();
    return;
  }
  
  // Normalize platform and arch to lowercase
  const platform = args.platform?.toLowerCase();
  const arch = args.arch?.toLowerCase();
  
  // Check platform/arch combination if both are specified
  if (platform && arch && !isSupported(platform, arch)) {
    console.error(`Error: The combination ${platform}-${arch} is not supported.`);
    console.error(`Supported combinations: ${SUPPORTED_TARGETS.map(t => `${t.platform}-${t.arch}`).join(', ')}`);
    return;
  }
  
  // Ensure the output directory exists
  await ensureDir(args.output);
  console.log(`Output directory: ${args.output}`);
  
  const buildResults: BuildResult[] = [];
  
  // Build for all platforms if requested (in parallel)
  if (args.all) {
    console.log("Building HQL for all supported platforms and architectures in parallel...");
    
    // Create build promises for all supported targets
    const buildPromises = SUPPORTED_TARGETS.map(target => 
      buildForPlatform(target.platform, target.arch, args.output, args.version, args.check)
    );
    
    // Wait for all builds to complete in parallel
    buildResults.push(...await Promise.all(buildPromises));
  } else if (platform || arch) {
    // Build for specified platform and/or architecture
    const targetPlatform = platform || getCurrentPlatform();
    const targetArch = arch || getCurrentArch();
    
    const result = await buildForPlatform(targetPlatform, targetArch, args.output, args.version, args.check);
    buildResults.push(result);
  } else {
    // Build for current platform (simpler process)
    const result = await buildForCurrentPlatform(args.output, args.version, args.check);
    buildResults.push(result);
  }
  
  // Summarize results
  const successCount = buildResults.filter(r => r.success).length;
  const failureCount = buildResults.length - successCount;
  
  console.log("\nBuild Summary:");
  
  if (failureCount > 0) {
    console.log(`❌ Failed builds: ${failureCount}`);
    buildResults
      .filter(r => !r.success)
      .forEach(r => console.log(`- ${r.platform}-${r.arch}`));
  } else {
    console.log(`✅ All builds completed successfully!: ${successCount}`);
  }
  
  console.log("\nBuild process completed!");
  
  // Exit with error code if any build failed
  if (failureCount > 0) {
    Deno.exit(1);
  }
}

if (import.meta.main) {
    main();
  }