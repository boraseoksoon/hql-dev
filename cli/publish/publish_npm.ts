// cli/publish/publish_npm.ts
import {
  join,
  resolve,
  readTextFile,
  writeTextFile,
  mkdir,
  runCmd,
  exit,
  getEnv,
  basename,
} from "../../src/platform/platform.ts";

import { exists } from "jsr:@std/fs@1.0.13";
import { buildJsModule } from "./build_js_module.ts";
import { getNpmUsername, getNextVersionInDir } from "./publish_common.ts";

/**
 * Publishes the npm/ folder to npm.
 * Steps:
 * 1. Build the npm/ folder using buildJsModule().
 * 2. Run dnt.ts to create the npm package
 * 3. Update package.json with a proper package name.
 * 4. Run "npm publish" from within npm/ folder.
 */
export async function publishNpm(options: {
  what: string;
  name?: string;
  version?: string;
  verbose?: boolean;
}): Promise<void> {
  const outDir = resolve(options.what);
  await mkdir(outDir, { recursive: true });
  
  if (options.verbose) {
    console.log(`Building JS module from ${outDir}...`);
  }
  
  // Build the JS module
  const jsModuleDir = await buildJsModule(outDir);
  
  // Check if the compiled JavaScript has ESM.sh imports
  // If it does, we might want to skip DNT and use our manual package creation
  let skipDnt = false;
  try {
    const esmFile = join(outDir, ".build", "esm.js");
    if (await exists(esmFile)) {
      const content = await readTextFile(esmFile);
      if (content.includes("https://esm.sh/")) {
        console.log("⚠️ Detected ESM.sh imports that may cause DNT to fail");
        console.log("Creating manual package to ensure compatibility...");
        skipDnt = true;
      }
    }
  } catch (error) {
    console.warn("Could not check for problematic imports:", error);
  }
  
  // 2. Only run DNT if we haven't decided to skip it
  if (!skipDnt) {
    console.log("Running dnt script to create npm package...");
    
    try {
      // Execute dnt.ts script
      const dntCmd = new Deno.Command(Deno.execPath(), {
        args: ["run", "-A", "./dnt.ts"],
        stdout: "piped",
        stderr: "piped",
      });
      
      const output = await dntCmd.output();
      
      if (!output.success) {
        const errorStr = new TextDecoder().decode(output.stderr);
        console.error("DNT execution failed:", errorStr);
        console.log("Creating a manual npm package as fallback...");
        
        // Create a fallback npm package manually
        await createManualNpmPackage(outDir, options.name, options.version);
      }
    } catch (error) {
      console.error("Error running dnt script:", error);
      console.log("Creating a manual npm package as fallback...");
      
      // Create a fallback npm package manually
      await createManualNpmPackage(outDir, options.name, options.version);
    }
  } else {
    // Skip DNT entirely and use our manual package creation
    await createManualNpmPackage(outDir, options.name, options.version);
  }
  
  // Update the package.json if needed
  const npmDistDir = join(outDir, "npm");
  const pkgJsonPath = join(npmDistDir, "package.json");
  
  if (await exists(pkgJsonPath)) {
    // Read and update the package.json
    let pkg = JSON.parse(await readTextFile(pkgJsonPath));
    
    // Update version if specified
    if (options.version) {
      pkg.version = options.version;
    } else {
      // Auto-increment the version
      const newVersion = await getNextVersionInDir(outDir, undefined);
      pkg.version = newVersion;
    }
    
    // Update package name if specified
    if (options.name) {
      pkg.name = options.name.startsWith("@")
        ? options.name
        : await getFormattedPackageName(options.name);
    }
    
    // Write updated package.json
    await writeTextFile(pkgJsonPath, JSON.stringify(pkg, null, 2));
    console.log(`Updated package.json in npm/ with name=${pkg.name} version=${pkg.version}`);
  } else {
    console.error("package.json not found in npm/. DNT execution might have failed.");
    return;
  }
  
  // Ensure README.md exists
  const readmePath = join(npmDistDir, "README.md");
  if (!(await exists(readmePath))) {
    const pkgName = options.name || "hql-package";
    await writeTextFile(readmePath, `# ${pkgName}\n\nAuto-generated README for the HQL module.`);
  }
  
  // Publish to npm if not in dry run mode
  const dryRun = getEnv("DRY_RUN_PUBLISH");
  const publishCmd = dryRun
    ? ["npm", "publish", "--dry-run", "--access", "public"]
    : ["npm", "publish", "--access", "public"];
  
  console.log(`Publishing package to npm from ${npmDistDir}...`);
  const proc = runCmd({
    cmd: publishCmd,
    cwd: npmDistDir,
    stdout: "inherit",
    stderr: "inherit",
  });
  
  const status = await proc.status();
  proc.close();
  
  if (!status.success) {
    console.error(`
npm publish failed with exit code ${status.code}. 
Possible issues:
- You may not be logged in to npm. Try 'npm login' first.
- You may not have permission to publish to this package name.
- The package version may already exist.
`);
    exit(status.code);
  }
  
  console.log(`
✅ Package published successfully to npm!
📦 View it at: https://www.npmjs.com/package/${options.name || "your-package-name"}`);
}

/**
 * Format a package name for npm, ensuring it follows npm naming conventions.
 */
async function getFormattedPackageName(name: string): Promise<string> {
  const npmUser = await getNpmUsername();
  
  // Format the name to be npm-compatible
  const formattedName = name.toLowerCase()
    .replace(/[^a-z0-9-]/g, "-") // Replace invalid chars with hyphens
    .replace(/-+/g, "-")         // Replace multiple hyphens with single one
    .replace(/^-|-$/g, "");      // Remove leading/trailing hyphens
  
  // Add the user's scope if available
  if (npmUser) {
    return `@${npmUser}/${formattedName}`;
  }
  
  return formattedName;
}

/**
 * Create a manual NPM package when DNT fails
 */
async function createManualNpmPackage(
  outDir: string,
  name?: string,
  version?: string
): Promise<void> {
  // Define paths
  const npmDir = join(outDir, "npm");
  const esmDir = join(npmDir, "esm");
  const scriptDir = join(npmDir, "script");
  const typesDir = join(npmDir, "types");
  
  // Create directories
  await mkdir(npmDir, { recursive: true });
  await mkdir(esmDir, { recursive: true });
  await mkdir(scriptDir, { recursive: true });
  await mkdir(typesDir, { recursive: true });
  
  // Format the package name
  const packageName = name || basename(outDir);
  
  // Get version
  const packageVersion = version || await getNextVersionInDir(outDir, undefined);
  
  // Find the esm.js file
  const esmFile = join(outDir, ".build", "esm.js");
  let sourceContent = "";
  
  try {
    sourceContent = await readTextFile(esmFile);
    
    // Check for and handle remote imports
    if (sourceContent.includes("https://esm.sh/")) {
      console.log("Processing ESM.sh imports for npm compatibility...");
      // Convert ESM.sh imports to npm imports
      sourceContent = sourceContent.replace(
        /import\s+([^"']+)\s+from\s+["']https:\/\/esm\.sh\/([^"']+)["'];/g, 
        'import $1 from "$2";'
      );
    }
  } catch (error) {
    console.error(`Error reading ESM file: ${error.message}`);
    sourceContent = `export default { name: "${packageName}" };\n`;
  }
  
  // Create ESM version
  await writeTextFile(join(esmDir, "index.js"), sourceContent);
  
  // Create declarations file
  await writeTextFile(join(typesDir, "index.d.ts"), `// Type definitions
declare const _default: {
  name: string;
  [key: string]: any;
};
export default _default;
`);
  
  // Create CommonJS version
  const cjsContent = convertToCommonJS(sourceContent);
  await writeTextFile(join(scriptDir, "index.js"), cjsContent);
  
  // Create package.json with dependencies for any remote imports
  const dependencies: Record<string, string> = {};
  
  // Extract dependencies from imports
  const importRegex = /import\s+[^"']+\s+from\s+["']([^"']+)["'];/g;
  let importMatch: RegExpExecArray | null;
  
  while ((importMatch = importRegex.exec(sourceContent)) !== null) {
    const importPath = importMatch[1];
    
    // Handle npm packages (converted from esm.sh)
    if (!importPath.startsWith("https://") && !importPath.startsWith("./") && !importPath.startsWith("../")) {
      // Remove version specifiers and scope paths
      let pkgName = importPath;
      if (pkgName.startsWith("npm:")) {
        pkgName = pkgName.substring(4);
      }
      
      // Remove path specifiers (e.g., lodash/fp)
      const mainPackage = pkgName.split("/")[0];
      dependencies[mainPackage] = "latest";
    }
  }
  
  // Create package.json
  const packageJson = {
    name: packageName,
    version: packageVersion,
    description: `HQL module: ${packageName}`,
    main: "./script/index.js",
    module: "./esm/index.js",
    types: "./types/index.d.ts",
    files: ["esm", "script", "types", "README.md"],
    dependencies: Object.keys(dependencies).length > 0 ? dependencies : undefined,
    repository: {
      type: "git",
      url: "https://github.com/username/repo.git"
    },
    engines: {
      node: ">=14.0.0"
    }
  };
  
  await writeTextFile(
    join(npmDir, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );
  
  // Create README.md
  await writeTextFile(
    join(npmDir, "README.md"),
    `# ${packageName}

Generated from HQL module.

## Installation

\`\`\`bash
npm install ${packageName}
\`\`\`
`
  );
  
  console.log(`Created manual NPM package in ${npmDir}`);
}

/**
 * Convert ESM format to CommonJS
 */
function convertToCommonJS(sourceContent: string): string {
  // Replace export statements with variable declarations
  let cjsContent = sourceContent.replace(/export\s+const\s+(\w+)/g, "const $1");
  cjsContent = cjsContent.replace(/export\s+function\s+(\w+)/g, "function $1");
  cjsContent = cjsContent.replace(/export\s+class\s+(\w+)/g, "class $1");
  
  // Collect all exported names
  const exportedNames: string[] = [];
  const exportRegex = /export\s+(?:const|function|class|let|var)\s+(\w+)/g;
  let match;
  while ((match = exportRegex.exec(sourceContent)) !== null) {
    exportedNames.push(match[1]);
  }
  
  // Handle default export
  let defaultExport = "";
  const defaultExportMatch = sourceContent.match(/export\s+default\s+([^;]+)/);
  if (defaultExportMatch) {
    cjsContent = cjsContent.replace(/export\s+default\s+([^;]+);/, "");
    defaultExport = `\nmodule.exports.default = ${defaultExportMatch[1]};`;
  }
  
  // Add exports
  const exportsStatement = exportedNames.length > 0 
    ? exportedNames.map(name => `module.exports.${name} = ${name};`).join("\n")
    : "";
  
  return `// CommonJS version (converted from ESM)
${cjsContent}

${exportsStatement}${defaultExport}
`;
}