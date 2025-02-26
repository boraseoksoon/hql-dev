// cli/publish/publish_jsr.ts
import {
  join,
  resolve,
  readTextFile,
  writeTextFile,
  mkdir,
  runCmd,
  exit,
  makeTempDir,
  basename,
} from "../../src/platform/platform.ts";
import { exists, copy } from "jsr:@std/fs@1.0.13";
import { buildJsModule } from "./build_js_module.ts";
import { getNextVersionInDir } from "./publish_common.ts";

/**
 * Publishes a directory as a JSR package.
 * This function:
 * 1. Builds the npm/ directory with ESM and CJS modules
 * 2. Creates a JSR config in the npm/ directory
 * 3. Publishes to JSR
 */
export async function publishJSR(options: {
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
  
  // Build the JS module (this creates the npm/ directory)
  const npmDistDir = await buildJsModule(outDir);

  if (!(await exists(npmDistDir))) {
    console.error("npm/ folder not found. Did the build process fail?");
    exit(1);
  }

  // Step 2: Read & update version from npm/package.json.
  const pkgJsonPath = join(npmDistDir, "package.json");
  let pkg: any = {};
  
  if (!(await exists(pkgJsonPath))) {
    console.error("package.json not found in npm/. Creating a basic one.");
    
    // Create a basic package.json
    const dirName = outDir.split("/").pop() || "hql-package";
    const username = await getJsrUsername();
    const defaultScopedName = `@${username}/${dirName.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
    
    pkg = {
      name: options.name || defaultScopedName,
      version: options.version || "0.1.0",
      description: `HQL module: ${basename(outDir)}`,
      main: "./index.js",
      module: "./index.js",
      repository: {
        type: "git",
        url: "git+https://github.com/username/repo.git"
      }
    };
    
    await writeTextFile(pkgJsonPath, JSON.stringify(pkg, null, 2));
  } else {
    pkg = JSON.parse(await readTextFile(pkgJsonPath));
  }

  let currentVersion = pkg.version || "0.0.1";
  
  // Get the next version
  const newVersion = options.version || await getNextVersionInDir(outDir, undefined);
  pkg.version = newVersion;

  // Step 3: Determine final package name.
  const dirName = outDir.split("/").pop() || "hql-package";
  const username = await getJsrUsername();
  const defaultScopedName = `@${username}/${dirName.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
  
  let finalName = (options.name || defaultScopedName)
    .toLowerCase()
    .replace(/[^a-z0-9\/@-]/g, "-");
  
  // Ensure the package name has a scope
  if (!finalName.startsWith("@")) {
    finalName = `@${username}/${finalName}`;
  }
  
  pkg.name = finalName;

  await writeTextFile(pkgJsonPath, JSON.stringify(pkg, null, 2));

  // Step 4: Create jsr.json inside npm/ referencing the ESM output.
  // dnt emits the shimmed bundle in npm/esm/bundle.js.
  const jsrPath = join(npmDistDir, "jsr.json");
  const jsrConfig = {
    name: finalName,
    version: newVersion,
    exports: "./esm/index.js",
    publish: {
      include: ["LICENSE", "README.md", "esm/**/*", "script/**/*", "types/**/*"]
    },
    tasks: {
      build: "deno run -A ../esmbuild.ts"
    }
  };
  
  await writeTextFile(jsrPath, JSON.stringify(jsrConfig, null, 2));
  
  if (options.verbose) {
    console.log(`Created jsr.json in npm/: ${jsrPath}`);
    console.log(`jsr.json content: ${JSON.stringify(jsrConfig, null, 2)}`);
  }

  // Step 5: Ensure a README exists.
  const readmePath = join(npmDistDir, "README.md");
  if (!(await exists(readmePath))) {
    await writeTextFile(readmePath, `# ${finalName}

Auto-generated README for JSR package.

## Installation

\`\`\`bash
# Using Deno
import { YourExport } from "jsr:${finalName}@${newVersion}";

# Using npm
npm install ${finalName}
\`\`\`

## Usage

\`\`\`js
import { YourExport } from "${finalName}";

// Your code here
\`\`\`
`);
  }

  // Step 6: Copy the entire npm/ folder to a temporary directory and run "deno publish" from there.
  console.log("Copying npm folder to temporary directory...");
  const tempDir = await makeTempDir();
  
  try {
    await copy(npmDistDir, tempDir, { overwrite: true });
  } catch (error) {
    console.error(`Error copying npm folder: ${error.message}`);
    exit(1);
  }

  console.log(`Publishing ${finalName}@${newVersion} to JSR from temp directory...`);
  
  // Create a simpler jsr.json file that will definitely work
  const simplifiedJsr = {
    name: finalName,
    version: newVersion,
    exports: "./esm/index.js"
  };
  
  try {
    await writeTextFile(join(tempDir, "jsr.json"), JSON.stringify(simplifiedJsr, null, 2));
  } catch (error) {
    console.error(`Error creating jsr.json: ${error.message}`);
  }
  
  // Make sure there's a proper main entry file
  const mainFile = join(tempDir, "esm", "index.js");
  
  try {
    if (!(await exists(mainFile))) {
      // Find another suitable entry file
      let entryFile;
      
      for await (const entry of Deno.readDir(join(tempDir, "esm"))) {
        if (entry.isFile && entry.name.endsWith(".js")) {
          entryFile = join(tempDir, "esm", entry.name);
          break;
        }
      }
      
      if (entryFile) {
        // Create a basic entry point that exports from the found file
        console.log(`Creating entry point index.js that re-exports from ${entryFile}...`);
        const relativePath = `./${basename(entryFile)}`;
        await writeTextFile(mainFile, `export * from "${relativePath}";\n`);
      } else {
        // No JS files found, create a minimal entry point
        console.log("No JS files found in esm/, creating minimal entry point...");
        await writeTextFile(mainFile, `export default { name: "${finalName}" };\n`);
      }
    }
  } catch (error) {
    console.error(`Error creating entry file: ${error.message}`);
  }
  
  // Add extra flags if verbose mode is enabled
  const publishFlags = ["--allow-dirty"];
  if (options.verbose) {
    publishFlags.push("--verbose");
  }
  
  const publishProc = runCmd({
    cmd: ["deno", "publish", ...publishFlags],
    cwd: tempDir,
    stdout: "inherit",
    stderr: "inherit",
  });
  
  const status = await publishProc.status();
  publishProc.close();
  
  if (!status.success) {
    console.error(`
JSR publish failed with exit code ${status.code}.
Possible issues:
- You may not be logged in to JSR. Try 'deno login' first.
- You may not have permission to publish to this package name.
- There might be type errors in the generated code.
`);
    exit(status.code);
  }
  
  console.log(`
✅ JSR publish succeeded!
📦 View your package at: https://jsr.io/packages/${encodeURIComponent(finalName)}
`);
}

/**
 * Get the current user's JSR username.
 * Attempts to read from ~/.deno/registries.json if it exists,
 * otherwise falls back to a default.
 */
async function getJsrUsername(): Promise<string> {
  try {
    const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || "";
    const registriesPath = join(homeDir, ".deno", "registries.json");
    
    if (await exists(registriesPath)) {
      const registries = JSON.parse(await readTextFile(registriesPath));
      if (registries.jsr && registries.jsr.user && registries.jsr.user.name) {
        return registries.jsr.user.name;
      }
    }
  } catch (error) {
    console.warn("Could not read JSR username:", error.message);
  }
  
  // Fallback to a default username
  return "username";
}