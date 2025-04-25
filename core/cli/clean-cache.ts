#!/usr/bin/env deno run -A

import { getCacheDir, clearCache } from "../src/common/hql-cache-tracker.ts";
import { parse } from "https://deno.land/std@0.170.0/flags/mod.ts";

// Parse command line arguments
const flags = parse(Deno.args, {
  boolean: ["help", "stats", "force", "h", "y"],
  string: ["age"],
  alias: { h: "help", y: "force" },
});

if (flags.help || flags.h) {
  console.log("Usage: deno run -A core/cli/clean-cache.ts [options]");
  console.log("\nOptions:");
  console.log("  --stats         Show cache statistics without cleaning");
  console.log("  --age <days>    Only clear cache entries older than specified days");
  console.log("  --force, -y     Force clean without confirmation");
  console.log("  --help, -h      Show this help message");
  console.log("\nExamples:");
  console.log("  deno run -A core/cli/clean-cache.ts              # Clean cache with confirmation");
  console.log("  deno run -A core/cli/clean-cache.ts --force      # Clean cache without confirmation");
  console.log("  deno run -A core/cli/clean-cache.ts --age 7      # Clean cache entries older than 7 days");
  console.log("  deno run -A core/cli/clean-cache.ts --stats      # Show cache statistics");
  Deno.exit(0);
}

// Get cache directory and stats
const cacheDir = await getCacheDir();
const stats = await getCacheStats();

// Format the cache size in a human-readable format
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Display cache statistics
console.log(`\nHQL Cache Information:`);
console.log(`Cache directory: ${cacheDir}`);
console.log(`Files in cache: ${stats.files}`);
console.log(`Cache size: ${formatBytes(stats.bytes)}`);

// If only stats are requested, exit here
if (flags.stats) {
  Deno.exit(0);
}

// Check if we need to clean based on age
if (flags.age) {
  const ageInDays = parseInt(flags.age);
  if (isNaN(ageInDays) || ageInDays < 1) {
    console.error("Error: Age must be a positive number of days");
    Deno.exit(1);
  }
  
  console.log(`\nCleaning cache entries older than ${ageInDays} days...`);
  // Implement age-based cleaning
  // This would require a more complex cleanup that traverses the cache
  console.log("Age-based cleaning not yet implemented. Please use --force for full cache cleanup.");
  Deno.exit(0);
}

// Confirm cache clearing unless --force is used
if (!flags.force) {
  console.log("\nAre you sure you want to clean the cache? [y/N] ");
  const buf = new Uint8Array(1);
  await Deno.stdin.read(buf);
  const answer = new TextDecoder().decode(buf).trim().toLowerCase();
  if (answer !== 'y') {
    console.log("Cache cleaning cancelled.");
    Deno.exit(0);
  }
}

// Clean the cache
console.log("\nCleaning cache...");
await clearCache();
console.log("Cache cleaned successfully."); 