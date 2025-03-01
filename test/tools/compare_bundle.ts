// test/tools/compare_bundle.ts
// This script compares regular transpilation vs bundled transpilation

import { basename, dirname, join, resolve } from "https://deno.land/std@0.170.0/path/mod.ts";
import { exists, ensureDir } from "https://deno.land/std@0.170.0/fs/mod.ts";

// Helper to run a command and get its output
async function runCommand(cmd: string[]): Promise<string> {
  const process = Deno.run({
    cmd,
    stdout: "piped",
    stderr: "piped"
  });
  
  const [status, stdout, stderr] = await Promise.all([
    process.status(),
    process.output(),
    process.stderrOutput()
  ]);
  
  process.close();
  
  if (!status.success) {
    throw new Error(`Command failed: ${new TextDecoder().decode(stderr)}`);
  }
  
  return new TextDecoder().decode(stdout);
}

// Helper to measure execution time
async function timeExecution<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return [result, end - start];
}

// Main comparison function
async function compareBundle(hqlPath: string): Promise<void> {
  console.log(`\n🔍 Comparing regular transpilation vs bundled transpilation for: ${hqlPath}`);
  
  const absPath = resolve(hqlPath);
  const baseDir = dirname(absPath);
  const baseName = basename(absPath, ".hql");
  
  // Create output paths
  const regularJsPath = join(baseDir, `${baseName}.regular.js`);
  const bundledJsPath = join(baseDir, `${baseName}.bundle.js`);
  
  console.log(`\n📊 Transpilation Performance:`);
  
  // Measure regular transpilation time
  const [_, regularTime] = await timeExecution(async () => {
    await runCommand([
      "deno", "run", "-A", "./cli/transpile.ts", 
      absPath, regularJsPath
    ]);
    return true;
  });
  
  console.log(`⏱️  Regular transpilation: ${regularTime.toFixed(2)} ms`);
  
  // Measure bundled transpilation time
  const [__, bundleTime] = await timeExecution(async () => {
    await runCommand([
      "deno", "run", "-A", "./cli/transpile.ts", 
      absPath, bundledJsPath,
      "--bundle"
    ]);
    return true;
  });
  
  console.log(`⏱️  Bundled transpilation: ${bundleTime.toFixed(2)} ms`);
  console.log(`⚡ Bundle overhead: ${(bundleTime - regularTime).toFixed(2)} ms (${((bundleTime / regularTime) * 100 - 100).toFixed(1)}% slower)`);
  
  // Compare file sizes
  const regularSize = (await Deno.stat(regularJsPath)).size;
  const bundledSize = (await Deno.stat(bundledJsPath)).size;
  
  console.log(`\n📏 File Size Comparison:`);
  console.log(`📄 Regular JS: ${(regularSize / 1024).toFixed(2)} KB`);
  console.log(`📦 Bundled JS: ${(bundledSize / 1024).toFixed(2)} KB`);
  console.log(`📈 Size difference: ${((bundledSize - regularSize) / 1024).toFixed(2)} KB (${((bundledSize / regularSize) * 100 - 100).toFixed(1)}% larger)`);
  
  // Count imports in regular JS
  const regularContent = await Deno.readTextFile(regularJsPath);
  const importMatches = regularContent.match(/import .* from .*/g) || [];
  
  console.log(`\n🔗 Import Analysis:`);
  console.log(`📥 Regular JS contains ${importMatches.length} import statements`);
  
  if (importMatches.length > 0) {
    console.log("\nImport types in regular JS:");
    
    // Categorize imports
    const relativeImports = importMatches.filter(i => i.includes('./') || i.includes('../'));
    const remoteImports = importMatches.filter(i => i.includes('http'));
    const npmImports = importMatches.filter(i => i.includes('npm:'));
    const jsrImports = importMatches.filter(i => i.includes('jsr:'));
    const otherImports = importMatches.filter(i => 
      !relativeImports.includes(i) && 
      !remoteImports.includes(i) && 
      !npmImports.includes(i) &&
      !jsrImports.includes(i)
    );
    
    console.log(`- Relative: ${relativeImports.length}`);
    console.log(`- HTTP/HTTPS: ${remoteImports.length}`);
    console.log(`- NPM: ${npmImports.length}`);
    console.log(`- JSR: ${jsrImports.length}`);
    console.log(`- Other: ${otherImports.length}`);
  }
  
  // Test execution times
  console.log(`\n⚙️ Execution Performance:`);
  
  let regularExecTime = 0;
  let bundledExecTime = 0;
  
  try {
    [_, regularExecTime] = await timeExecution(async () => {
      await runCommand(["deno", "run", "-A", regularJsPath]);
      return true;
    });
    
    console.log(`⏱️  Regular JS execution: ${regularExecTime.toFixed(2)} ms`);
  } catch (error) {
    console.error(`❌ Error executing regular JS: ${error.message}`);
  }
  
  try {
    [__, bundledExecTime] = await timeExecution(async () => {
      await runCommand(["deno", "run", "-A", bundledJsPath]);
      return true;
    });
    
    console.log(`⏱️  Bundled JS execution: ${bundledExecTime.toFixed(2)} ms`);
    
    if (regularExecTime > 0) {
      const diff = bundledExecTime - regularExecTime;
      console.log(`${diff > 0 ? '🐢' : '🚀'} Execution difference: ${diff.toFixed(2)} ms (${((bundledExecTime / regularExecTime) * 100 - 100).toFixed(1)}% ${diff > 0 ? 'slower' : 'faster'})`);
    }
  } catch (error) {
    console.error(`❌ Error executing bundled JS: ${error.message}`);
  }
  
  console.log(`\n✅ Comparison complete. Files generated:`);
  console.log(`   - ${regularJsPath}`);
  console.log(`   - ${bundledJsPath}`);
}

// Main function
async function main() {
  // Ensure we have an input file
  if (Deno.args.length < 1) {
    console.error("Usage: deno run -A compare_bundle.ts <hql_file_path>");
    Deno.exit(1);
  }

  const hqlPath = Deno.args[0];
  
  // Check if file exists
  if (!await exists(hqlPath)) {
    console.error(`Error: File not found: ${hqlPath}`);
    Deno.exit(1);
  }
  
  // Ensure output directory exists
  await ensureDir(dirname(hqlPath));
  
  // Run comparison
  try {
    await compareBundle(hqlPath);
  } catch (error) {
    console.error(`Error during comparison: ${error.message}`);
    Deno.exit(1);
  }
}

// Run main when executed directly
if (import.meta.main) {
  main();
}