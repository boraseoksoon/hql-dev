#!/usr/bin/env -S deno run -A
// cli/hql_bundle.ts - Bundle HQL files to clean ESM JavaScript

import { parseArgs } from "jsr:@std/cli@1.0.13/parse-args";
import { resolve, dirname, basename } from "https://deno.land/std@0.170.0/path/mod.ts";
import { exists } from "jsr:@std/fs@1.0.13";
import { bundleFileESM } from "../src/bundler/bundler.ts";

function showHelp() {
  console.log(`
HQL Bundler - Bundle HQL files into clean ESM JavaScript

USAGE:
  hql_bundle [options] <input.hql> [output.js]

OPTIONS:
  -help, -h      Show this help message
  -verbose, -v   Enable verbose output

EXAMPLES:
  hql_bundle ./main.hql
  hql_bundle ./main.hql ./bundle.js
`);
}

async function main() {
  const args = Deno.args;
  const parsedArgs = parseArgs(args, {
    boolean: ["help", "verbose"],
    alias: { h: "help", v: "verbose" }
  });

  if (parsedArgs.help) {
    showHelp();
    Deno.exit(0);
  }

  // Get input file
  let inputPath: string;
  if (parsedArgs._.length === 0) {
    console.error("Error: No input file specified");
    showHelp();
    Deno.exit(1);
  }

  inputPath = String(parsedArgs._[0]);
  
  // Get output file
  let outputPath: string;
  if (parsedArgs._.length > 1) {
    outputPath = String(parsedArgs._[1]);
  } else {
    // Default to input path with .js extension
    outputPath = inputPath.replace(/\.hql$/, '.js');
    if (outputPath === inputPath) outputPath += '.js';
  }

  // Set verbose mode if needed
  if (parsedArgs.verbose) {
    Deno.env.set("HQL_DEBUG", "1");
  }

  // Resolve paths
  const resolvedInput = resolve(inputPath);
  const resolvedOutput = resolve(outputPath);

  // Check if input file exists
  if (!await exists(resolvedInput)) {
    console.error(`Error: Input file not found: ${resolvedInput}`);
    Deno.exit(1);
  }

  console.log(`Bundling ${resolvedInput} to ${resolvedOutput}...`);

  try {
    // Create output directory if needed
    await Deno.mkdir(dirname(resolvedOutput), { recursive: true });

    // Bundle the file
    const startTime = performance.now();
    const bundle = await bundleFileESM(resolvedInput);
    const endTime = performance.now();

    // Write the output
    await Deno.writeTextFile(resolvedOutput, bundle);

    console.log(`Successfully bundled in ${Math.round(endTime - startTime)}ms`);
    console.log(`Output: ${resolvedOutput}`);
  } catch (error) {
    console.error("Error bundling file:", error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}